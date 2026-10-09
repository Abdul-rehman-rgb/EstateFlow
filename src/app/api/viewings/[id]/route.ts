import { db, Row, settings, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, idParam, readJson } from "@/lib/http";
import { ApiError, addDays, nowIso, oneOf, str } from "@/lib/util";
import { requirePerm, ownerScope } from "@/lib/permissions";
import { logActivity } from "@/lib/leads";
import { OUTCOME_LEAD_STATUS, VIEWING_OUTCOMES, VIEWING_STATUSES } from "@/lib/viewings";

async function visibleViewing(user: Parameters<typeof ownerScope>[0], id: number): Promise<Row | undefined> {
  const scope = ownerScope(user, "agent_id", "branch_id");
  return await db().prepare(`SELECT * FROM viewings WHERE id = ? AND ${scope.sql}`).get(id, ...scope.params) as Row | undefined;
}

export const GET = api(async (_req, user, p) => {
  const v = await visibleViewing(user, idParam(p.id));
  if (!v) throw new ApiError(404, "Viewing not found.");
  return v;
});

/**
 * Records the outcome. A completed viewing with a recorded outcome creates a post-viewing
 * follow-up task for the agent (due in 24h) and moves the lead along the pipeline.
 */
export const PATCH = api(async (req, user, p) => {
  requirePerm(user, "viewings:write");
  const id = idParam(p.id);
  const v = await visibleViewing(user, id);
  if (!v) throw new ApiError(404, "Viewing not found.");
  if (v.status === "rescheduled") throw new ApiError(409, "This viewing was rescheduled; update the new viewing instead.");
  const body = await readJson(req);
  const status = body.status !== undefined ? oneOf(body.status, VIEWING_STATUSES, "viewing status") : v.status;
  const outcome = body.outcome !== undefined && body.outcome !== null && body.outcome !== ""
    ? oneOf(body.outcome, VIEWING_OUTCOMES, "outcome") : v.outcome;
  const now = nowIso();

  await tx(async () => {
    await db().prepare(
      `UPDATE viewings SET status = ?, outcome = ?, feedback = ?, objections = ?, next_steps = ?, updated_at = ? WHERE id = ?`,
    ).run(
      status, outcome,
      body.feedback !== undefined ? str(body.feedback) : v.feedback,
      body.objections !== undefined ? str(body.objections) : v.objections,
      body.next_steps !== undefined ? str(body.next_steps) : v.next_steps,
      now, id,
    );
    const outcomeChanged = outcome && outcome !== v.outcome;
    if (status === "completed" || status === "no_show") {
      if (outcomeChanged || (status !== v.status)) {
        const lead = await db().prepare("SELECT name, status FROM leads WHERE id = ?").get(v.lead_id) as Row;
        const followUp = outcome === "follow_up_required" || !outcome || outcome === "interested";
        if (status === "completed" && followUp) {
          await db().prepare(
            `INSERT INTO tasks (title, lead_id, property_id, branch_id, assigned_to, due_at, priority, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'high', ?, ?)`,
          ).run(`Post-viewing follow-up: ${lead.name}`, v.lead_id, v.property_id, v.branch_id, v.agent_id,
            addDays(now, 1), user.id, now);
        }
      }
    }
    if (outcome && OUTCOME_LEAD_STATUS[outcome] && status === "completed") {
      const next = OUTCOME_LEAD_STATUS[outcome];
      if ((await settings()).lead_stages.includes(next)) {
        await db().prepare("UPDATE leads SET status = ?, updated_at = ? WHERE id = ?").run(next, now, v.lead_id);
      }
    }
    await logActivity({
      leadId: v.lead_id, propertyId: v.property_id, kind: "viewing", userId: user.id,
      outcome, body: `Viewing ${status}${outcome ? ` — ${outcome.replace(/_/g, " ")}` : ""}${body.feedback ? `: ${str(body.feedback)}` : ""}`,
    });
    await audit(user.id, "update", "viewing", id, { status, outcome });
  });
  return await db().prepare("SELECT * FROM viewings WHERE id = ?").get(id);
});

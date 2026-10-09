import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, idParam, readJson } from "@/lib/http";
import { ApiError, nowIso } from "@/lib/util";
import { requirePerm, ownerScope } from "@/lib/permissions";
import { logActivity } from "@/lib/leads";
import { findConflicts, parseWhen } from "@/lib/viewings";

/** Marks the viewing as rescheduled and books a replacement at the new time (conflict-checked). */
export const POST = api(async (req, user, p) => {
  requirePerm(user, "viewings:write");
  const id = idParam(p.id);
  const scope = ownerScope(user, "agent_id", "branch_id");
  const v = await db().prepare(`SELECT * FROM viewings WHERE id = ? AND ${scope.sql}`).get(id, ...scope.params) as Row | undefined;
  if (!v) throw new ApiError(404, "Viewing not found.");
  if (v.status !== "scheduled") throw new ApiError(409, "Only scheduled viewings can be rescheduled.");
  const body = await readJson(req);
  const when = parseWhen(body.scheduled_at);
  const duration = Number(body.duration_min ?? v.duration_min);
  const conflicts = await findConflicts(v.agent_id, when, duration, id);
  if (conflicts.length && !body.allow_conflict) throw new ApiError(409, "The agent already has a viewing at this time.", { conflicts });

  const newId = await tx(async () => {
    const now = nowIso();
    const res = await db().prepare(
      `INSERT INTO viewings (property_id, lead_id, agent_id, branch_id, scheduled_at, duration_min, mode, location,
        meeting_link, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)`,
    ).run(v.property_id, v.lead_id, v.agent_id, v.branch_id, when, duration, v.mode, v.location, v.meeting_link,
      user.id, now, now);
    const nid = Number(res.lastInsertRowid);
    await db().prepare("UPDATE viewings SET status = 'rescheduled', rescheduled_to = ?, updated_at = ? WHERE id = ?").run(nid, now, id);
    await logActivity({ leadId: v.lead_id, propertyId: v.property_id, kind: "viewing", userId: user.id, body: `Viewing rescheduled to ${when}` });
    await audit(user.id, "reschedule", "viewing", id, { new_id: nid, scheduled_at: when });
    return nid;
  });
  return { ...(await db().prepare("SELECT * FROM viewings WHERE id = ?").get(newId) as Row), conflicts };
});

import { db, Row, tx, settings } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, idParam, readJson } from "@/lib/http";
import { ApiError, nowIso, oneOf } from "@/lib/util";
import { can, requirePerm } from "@/lib/permissions";
import { findDuplicates, leadInput, logActivity, scoreLead, validateStatus, visibleLead } from "@/lib/leads";

async function leadDetail(id: number) {
  const d = db();
  const lead = await d.prepare(
    `SELECT l.*, u.name AS assigned_name, p.ref AS property_ref, p.title AS property_title
     FROM leads l LEFT JOIN users u ON u.id = l.assigned_to LEFT JOIN properties p ON p.id = l.property_id
     WHERE l.id = ?`,
  ).get(id) as Row;
  return {
    ...lead,
    ...scoreLead(lead, (await settings()).sla_first_response_hours),
    activities: await d.prepare(
      `SELECT a.*, u.name AS user_name FROM activities a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.lead_id = ? ORDER BY a.created_at DESC LIMIT 200`,
    ).all(id),
    tasks: await d.prepare(
      `SELECT t.*, u.name AS assignee_name FROM tasks t JOIN users u ON u.id = t.assigned_to
       WHERE t.lead_id = ? ORDER BY t.status, t.due_at`,
    ).all(id),
    viewings: await d.prepare(
      `SELECT v.*, p.ref AS property_ref, p.title AS property_title, u.name AS agent_name FROM viewings v
       JOIN properties p ON p.id = v.property_id LEFT JOIN users u ON u.id = v.agent_id
       WHERE v.lead_id = ? ORDER BY v.scheduled_at DESC`,
    ).all(id),
    deals: await d.prepare("SELECT * FROM deals WHERE lead_id = ? ORDER BY id DESC").all(id),
    documents: await d.prepare(
      "SELECT id, kind, title, original_name, version, approval_status, expires_at, sensitive, created_at FROM documents WHERE lead_id = ? ORDER BY created_at DESC",
    ).all(id),
    duplicates: await findDuplicates(lead.phone_norm, lead.email_norm, id),
  };
}

export const GET = api(async (_req, user, p) => {
  requirePerm(user, "leads:write");
  const id = idParam(p.id);
  if (!await visibleLead(user, id)) throw new ApiError(404, "Lead not found.");
  return await leadDetail(id);
});

export const PATCH = api(async (req, user, p) => {
  requirePerm(user, "leads:write");
  const id = idParam(p.id);
  const existing = await visibleLead(user, id);
  if (!existing) throw new ApiError(404, "Lead not found.");
  const body = await readJson(req);
  const changes = leadInput(body, true);
  if (body.status !== undefined && body.status !== existing.status) {
    changes.status = await validateStatus(body.status);
    if (changes.status === "lost") {
      changes.lost_reason = oneOf(body.lost_reason, (await settings()).lost_reasons, "lost reason");
    } else {
      changes.lost_reason = null;
    }
    if (changes.status === "contacted" && !existing.first_response_at) changes.first_response_at = nowIso();
  }
  if (Object.keys(changes).length === 0) return await leadDetail(id);

  await tx(async () => {
    const keys = Object.keys(changes);
    await db().prepare(`UPDATE leads SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
      .run(...keys.map((k) => changes[k] ?? null), nowIso(), id);
    if (changes.status && changes.status !== existing.status) {
      await logActivity({
        leadId: id, kind: "status_change", userId: user.id,
        body: `Status: ${existing.status} → ${changes.status}${changes.lost_reason ? ` (${changes.lost_reason})` : ""}`,
      });
    }
    await audit(user.id, "update", "lead", id, { fields: keys.filter((k) => !k.endsWith("_norm")) });
  });
  return await leadDetail(id);
});

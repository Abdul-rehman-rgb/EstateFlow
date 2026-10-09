import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, readJson } from "@/lib/http";
import { ApiError, int, nowIso, str } from "@/lib/util";
import { requirePerm, ownerScope, scopeOf } from "@/lib/permissions";
import { visibleLead, logActivity } from "@/lib/leads";
import { visibleProperty } from "@/lib/properties";
import { findConflicts, parseWhen, viewingInput } from "@/lib/viewings";

export const GET = api(async (req, user) => {
  const q = new URL(req.url).searchParams;
  const scope = ownerScope(user, "v.agent_id", "v.branch_id");
  const where = [scope.sql];
  const params: (string | number | null)[] = [...scope.params];
  if (q.get("from")) { where.push("v.scheduled_at >= ?"); params.push(parseWhen(q.get("from"))); }
  if (q.get("to")) { where.push("v.scheduled_at <= ?"); params.push(parseWhen(q.get("to"))); }
  if (q.get("status")) { where.push("v.status = ?"); params.push(q.get("status")!); }
  if (q.get("agent_id")) { where.push("v.agent_id = ?"); params.push(int(q.get("agent_id"))); }
  const rows = db().prepare(
    `SELECT v.*, p.ref AS property_ref, p.title AS property_title, l.name AS lead_name, l.phone AS lead_phone,
            u.name AS agent_name
     FROM viewings v JOIN properties p ON p.id = v.property_id JOIN leads l ON l.id = v.lead_id
     LEFT JOIN users u ON u.id = v.agent_id
     WHERE ${where.join(" AND ")} ORDER BY v.scheduled_at LIMIT 500`,
  ).all(...params);
  return { viewings: rows };
});

export const POST = api(async (req, user) => {
  requirePerm(user, "viewings:write");
  const body = await readJson(req);
  const propertyId = int(body.property_id);
  const leadId = int(body.lead_id);
  if (!propertyId || !leadId) throw new ApiError(400, "property_id and lead_id are required.");
  const property = visibleProperty(user, propertyId) as Row | undefined;
  const lead = visibleLead(user, leadId);
  if (!property) throw new ApiError(404, "Property not found.");
  if (!lead) throw new ApiError(404, "Lead not found.");

  const agentId = int(body.agent_id) ?? user.id;
  const agent = db().prepare("SELECT id, branch_id, active FROM users WHERE id = ?").get(agentId) as Row | undefined;
  if (!agent || !agent.active || (scopeOf(user) !== "all" && agent.branch_id !== user.branch_id)) {
    throw new ApiError(400, "Agent not found in your branch.");
  }
  const input = viewingInput(body);
  const when = parseWhen(body.scheduled_at);
  const conflicts = findConflicts(agentId, when, input.duration_min);
  if (conflicts.length && !body.allow_conflict) {
    throw new ApiError(409, "The agent already has a viewing at this time.", { conflicts });
  }

  const id = tx(() => {
    const now = nowIso();
    const res = db().prepare(
      `INSERT INTO viewings (property_id, lead_id, agent_id, branch_id, scheduled_at, duration_min, mode, location,
        meeting_link, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)`,
    ).run(propertyId, leadId, agentId, lead.branch_id, when, input.duration_min, input.mode, input.location,
      input.meeting_link, user.id, now, now);
    const vid = Number(res.lastInsertRowid);
    if (["new", "assigned", "contacted", "qualified", "nurture"].includes(lead.status)) {
      db().prepare("UPDATE leads SET status = 'viewing_scheduled', updated_at = ? WHERE id = ?").run(now, leadId);
    }
    logActivity({ leadId, propertyId, kind: "viewing", body: `Viewing booked for ${when} (${property.ref})`, userId: user.id });
    audit(user.id, "create", "viewing", vid, { property_id: propertyId, lead_id: leadId });
    return vid;
  });
  return { ...(db().prepare("SELECT * FROM viewings WHERE id = ?").get(id) as Row), conflicts };
});

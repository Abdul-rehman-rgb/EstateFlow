import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, readJson } from "@/lib/http";
import { ApiError, int, nowIso, num, oneOf, str } from "@/lib/util";
import { can, requirePerm } from "@/lib/permissions";
import { DEAL_TYPES, OPEN_DEAL_STAGES, commissionFor, dealScope, DEAL_STAGES } from "@/lib/deals";
import { visibleLead, logActivity } from "@/lib/leads";
import { visibleProperty } from "@/lib/properties";

export const GET = api(async (req, user) => {
  if (!can(user, "deals:read") && !can(user, "deals:write")) throw new ApiError(403, "Your role cannot view deals.");
  const q = new URL(req.url).searchParams;
  const scope = dealScope(user);
  const where = [scope.sql];
  const params: (string | number | null)[] = [...scope.params];
  if (q.get("stage")) { where.push("d.stage = ?"); params.push(q.get("stage")!); }
  if (q.get("open") === "1") { where.push(`d.stage IN (${OPEN_DEAL_STAGES.map(() => "?").join(",")})`); params.push(...OPEN_DEAL_STAGES); }
  const rows = await db().prepare(
    `SELECT d.*, l.name AS lead_name, p.ref AS property_ref, p.title AS property_title, u.name AS agent_name
     FROM deals d LEFT JOIN leads l ON l.id = d.lead_id LEFT JOIN properties p ON p.id = d.property_id
     LEFT JOIN users u ON u.id = d.agent_id WHERE ${where.join(" AND ")} ORDER BY d.updated_at DESC LIMIT 500`,
  ).all(...params);
  return { deals: rows, stages: DEAL_STAGES };
});

export const POST = api(async (req, user) => {
  requirePerm(user, "deals:write");
  const body = await readJson(req);
  const leadId = int(body.lead_id);
  const propertyId = int(body.property_id);
  if (!leadId || !propertyId) throw new ApiError(400, "lead_id and property_id are required.");
  const lead = await visibleLead(user, leadId) as Row | undefined;
  const property = await visibleProperty(user, propertyId) as Row | undefined;
  if (!lead) throw new ApiError(404, "Lead not found.");
  if (!property) throw new ApiError(404, "Property not found.");
  if (property.status !== "active") throw new ApiError(409, `This listing is ${property.status}; only active listings can take offers.`);

  const dealType = oneOf(body.deal_type ?? (property.listing_type === "rent" ? "rental" : property.sale_mode === "off_plan" ? "off_plan" : "secondary"), DEAL_TYPES, "deal type");
  const value = num(body.deal_value) ?? num(body.offer_amount) ?? property.price ?? 0;
  const percent = num(body.commission_percent) ?? 2;
  if (percent < 0 || percent > 100) throw new ApiError(400, "Commission percent must be between 0 and 100.");
  const agentId = int(body.agent_id) ?? lead.assigned_to ?? user.id;
  const now = nowIso();

  const id = await tx(async () => {
    const res = await db().prepare(
      `INSERT INTO deals (title, lead_id, property_id, branch_id, agent_id, deal_type, stage, deal_value, currency,
        commission_percent, commission_amount, commission_status, reservation_amount, reservation_expires_at,
        expected_close_date, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'offer_submitted', ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
    ).run(
      `${property.ref} — ${lead.name}`, leadId, propertyId, property.branch_id, agentId, dealType, value,
      property.currency ?? "AED", percent, commissionFor(value, percent),
      num(body.reservation_amount), body.reservation_expires_at ? new Date(String(body.reservation_expires_at)).toISOString() : null,
      body.expected_close_date ? new Date(String(body.expected_close_date)).toISOString() : null,
      user.id, now, now,
    );
    const did = Number(res.lastInsertRowid);
    if (num(body.offer_amount) !== null) {
      await db().prepare("INSERT INTO offers (deal_id, amount, terms, status, created_by, created_at) VALUES (?, ?, ?, 'submitted', ?, ?)")
        .run(did, num(body.offer_amount), str(body.terms), user.id, now);
    }
    const propStatus = property.listing_type === "rent" ? "reserved" : "under_offer";
    await db().prepare("UPDATE properties SET status = ?, updated_at = ? WHERE id = ?").run(propStatus, now, propertyId);
    await db().prepare("UPDATE leads SET status = 'offer_submitted', updated_at = ? WHERE id = ? AND status NOT IN ('won','lost')").run(now, leadId);
    await logActivity({ leadId, propertyId, dealId: did, kind: "status_change", userId: user.id, body: `Deal opened at ${value} ${property.currency ?? "AED"}` });
    await audit(user.id, "create", "deal", did, { lead_id: leadId, property_id: propertyId, value });
    return did;
  });
  return await db().prepare("SELECT * FROM deals WHERE id = ?").get(id);
});

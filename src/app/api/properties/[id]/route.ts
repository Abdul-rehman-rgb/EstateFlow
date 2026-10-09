import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, idParam, readJson } from "@/lib/http";
import { ApiError, nowIso } from "@/lib/util";
import { requirePerm } from "@/lib/permissions";
import { propertyInput, visibleProperty } from "@/lib/properties";

function detail(id: number) {
  const d = db();
  const property = d.prepare("SELECT * FROM properties WHERE id = ?").get(id) as Row;
  const viewings = d.prepare(
    `SELECT v.*, l.name AS lead_name, u.name AS agent_name FROM viewings v
     JOIN leads l ON l.id = v.lead_id LEFT JOIN users u ON u.id = v.agent_id
     WHERE v.property_id = ? ORDER BY v.scheduled_at DESC LIMIT 100`,
  ).all(id) as Row[];
  const enquiries = d.prepare("SELECT COUNT(*) AS c FROM leads WHERE property_id = ?").get(id) as Row;
  const offers = d.prepare(
    `SELECT COUNT(*) AS c FROM deals WHERE property_id = ?`,
  ).get(id) as Row;
  const documents = d.prepare(
    "SELECT id, kind, title, original_name, version, approval_status, expires_at, sensitive, created_at FROM documents WHERE property_id = ? ORDER BY created_at DESC",
  ).all(id);
  const deals = d.prepare("SELECT * FROM deals WHERE property_id = ? ORDER BY id DESC").all(id);
  const listedBy = d.prepare("SELECT name FROM users WHERE id = ?").get(property.listed_by) as Row | undefined;
  return {
    ...property,
    listed_by_name: listedBy?.name ?? null,
    performance: {
      enquiries: enquiries.c,
      viewings: viewings.length,
      viewings_completed: viewings.filter((v) => v.status === "completed").length,
      deals: offers.c,
    },
    viewings,
    documents,
    deals,
  };
}

export const GET = api(async (_req, user, p) => {
  const id = idParam(p.id);
  if (!visibleProperty(user, id)) throw new ApiError(404, "Property not found.");
  return detail(id);
});

export const PATCH = api(async (req, user, p) => {
  requirePerm(user, "properties:write");
  const id = idParam(p.id);
  const existing = visibleProperty(user, id);
  if (!existing) throw new ApiError(404, "Property not found.");
  const changes = propertyInput(await readJson(req), true);
  if (Object.keys(changes).length) {
    tx(() => {
      const keys = Object.keys(changes);
      db().prepare(`UPDATE properties SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
        .run(...keys.map((k) => changes[k] ?? null), nowIso(), id);
      audit(user.id, "update", "property", id, { fields: keys });
    });
  }
  return detail(id);
});

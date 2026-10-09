import { db, Row, settings, setSetting } from "./db";
import { audit } from "./audit";
import { ApiError, nowIso, normalizeEmail, normalizePhone, num, oneOf, str, int } from "./util";
import { ownerScope, inventoryScope, type CurrentUser } from "./permissions";

export const LEAD_SOURCES = [
  "Website", "Property Finder", "Bayut", "dubizzle", "Facebook/Instagram", "Referral",
  "Walk-in", "Phone", "Email", "WhatsApp", "Other",
] as const;
export const TIMELINES = ["immediate", "1_3_months", "3_6_months", "6_plus_months"] as const;
export const PURPOSES = ["buy", "rent"] as const;
export const PROPERTY_CATEGORIES = ["residential", "commercial", "land"] as const;
export const ACTIVITY_KINDS = ["note", "call", "email", "whatsapp", "sms", "meeting"] as const;
const RESPONSE_KINDS = new Set<string>(["call", "email", "whatsapp", "sms", "meeting"]);

export const OPEN_LEAD_STATUSES = ["new", "assigned", "contacted", "qualified", "viewing_scheduled", "offer_submitted", "nurture"];

/** Columns a client may send when creating or editing a lead. Partial mode only touches supplied keys. */
export function leadInput(body: Row, partial: boolean) {
  const out: Row = {};
  const has = (k: string) => !partial || body[k] !== undefined;
  if (has("name")) {
    const name = str(body.name);
    if (!name) throw new ApiError(400, "Lead name is required.");
    out.name = name;
  }
  if (has("phone")) {
    out.phone = str(body.phone);
    out.phone_norm = normalizePhone(body.phone);
  }
  if (has("email")) {
    out.email = str(body.email);
    out.email_norm = normalizeEmail(body.email);
  }
  if (!partial && !out.phone_norm && !out.email_norm) {
    throw new ApiError(400, "A phone number or email is required so the lead can be contacted and de-duplicated.");
  }
  if (has("language")) out.language = str(body.language) ?? "English";
  if (has("nationality")) out.nationality = str(body.nationality);
  if (has("purpose")) out.purpose = oneOf(body.purpose ?? "buy", PURPOSES, "purpose");
  if (has("property_type")) out.property_type = body.property_type ? oneOf(body.property_type, PROPERTY_CATEGORIES, "property type") : null;
  if (has("preferred_area")) out.preferred_area = str(body.preferred_area);
  if (has("budget_min")) out.budget_min = num(body.budget_min);
  if (has("budget_max")) out.budget_max = num(body.budget_max);
  if (has("bedrooms")) out.bedrooms = int(body.bedrooms);
  if (has("timeline")) out.timeline = body.timeline ? oneOf(body.timeline, TIMELINES, "timeline") : null;
  if (has("source")) out.source = body.source ? oneOf(body.source, LEAD_SOURCES, "source") : null;
  if (has("campaign")) out.campaign = str(body.campaign);
  if (has("portal_ref")) out.portal_ref = str(body.portal_ref);
  if (has("property_id")) out.property_id = int(body.property_id);
  if (has("marketing_consent")) out.marketing_consent = body.marketing_consent ? 1 : 0;
  if (has("opted_out")) out.opted_out = body.opted_out ? 1 : 0;
  return out;
}

/** Other leads sharing a phone or email with the given contact details. */
export function findDuplicates(phoneNorm: string | null, emailNorm: string | null, excludeId?: number): Row[] {
  if (!phoneNorm && !emailNorm) return [];
  return db()
    .prepare(
      `SELECT id, name, phone, email, status, assigned_to, branch_id, created_at FROM leads
       WHERE ((phone_norm IS NOT NULL AND phone_norm = ?) OR (email_norm IS NOT NULL AND email_norm = ?))
       ${excludeId ? "AND id != ?" : ""} ORDER BY id LIMIT 20`,
    )
    .all(...[phoneNorm, emailNorm, ...(excludeId ? [excludeId] : [])]) as Row[];
}

export function defaultBranchId(user: CurrentUser): number | null {
  if (user.branch_id) return user.branch_id;
  const row = db().prepare("SELECT id FROM branches ORDER BY id LIMIT 1").get() as Row | undefined;
  return row?.id ?? null;
}

/** Picks an agent in the branch according to the configured assignment mode. */
export function pickAssignee(branchId: number | null): number | null {
  const mode = settings().assignment_mode;
  if (mode === "manual" || branchId === null) return null;
  const agents = db()
    .prepare("SELECT id FROM users WHERE role = 'agent' AND active = 1 AND branch_id = ? ORDER BY id")
    .all(branchId) as Row[];
  if (!agents.length) return null;

  if (mode === "workload") {
    const countStmt = db().prepare(
      `SELECT COUNT(*) AS c FROM leads WHERE assigned_to = ? AND status NOT IN ('won','lost')`,
    );
    let best = agents[0].id as number;
    let bestCount = Infinity;
    for (const a of agents) {
      const c = (countStmt.get(a.id) as Row).c as number;
      if (c < bestCount) {
        best = a.id;
        bestCount = c;
      }
    }
    return best;
  }

  // round_robin: continue after the last agent who received a lead in this branch.
  const key = `rr_last_branch_${branchId}`;
  const last = Number(db().prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value ?? 0);
  const next = agents.find((a) => (a.id as number) > last) ?? agents[0];
  setSetting(key, String(next.id));
  return next.id as number;
}

export function logActivity(a: {
  leadId?: number | null; propertyId?: number | null; dealId?: number | null;
  kind: string; outcome?: string | null; body?: string | null; durationMin?: number | null; userId: number | null;
}) {
  db()
    .prepare(
      `INSERT INTO activities (lead_id, property_id, deal_id, kind, outcome, body, duration_min, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(a.leadId ?? null, a.propertyId ?? null, a.dealId ?? null, a.kind, a.outcome ?? null, a.body ?? null,
      a.durationMin ?? null, a.userId, nowIso());
}

/** Priority score 0-100 from budget, intent, timing, source and response urgency. */
export function scoreLead(lead: Row): { score: number; band: "High" | "Medium" | "Low" } {
  if (["won", "lost"].includes(lead.status)) return { score: 0, band: "Low" };
  let score = 0;
  if (lead.budget_max) score += 20;
  if (lead.timeline === "immediate") score += 25;
  else if (lead.timeline === "1_3_months") score += 15;
  if (lead.source && ["Website", "Property Finder", "Bayut", "dubizzle", "Referral"].includes(lead.source)) score += 10;
  if (lead.phone_norm && lead.email_norm) score += 5;
  if (lead.property_id) score += 10;
  if (!lead.first_response_at && lead.status !== "nurture") {
    const hours = (Date.now() - new Date(lead.created_at).getTime()) / 3_600_000;
    if (hours >= settings().sla_first_response_hours) score += 30;
    else score += 10;
  }
  score = Math.min(100, score);
  return { score, band: score >= 60 ? "High" : score >= 35 ? "Medium" : "Low" };
}

/** Active listings that fit a lead's purpose, budget, type, area and bedrooms. */
export function matchProperties(lead: Row, user: CurrentUser, limit = 10) {
  const listingType = lead.purpose === "rent" ? "rent" : "sale";
  const scope = inventoryScope(user);
  const rows = db()
    .prepare(
      `SELECT * FROM properties WHERE status = 'active' AND listing_type = ? AND ${scope.sql}`,
    )
    .all(listingType, ...scope.params) as Row[];

  const area = (lead.preferred_area ?? "").toLowerCase();
  const scored = rows.map((p) => {
    let score = 0;
    const reasons: string[] = [];
    if (lead.budget_max && p.price != null) {
      if (p.price <= lead.budget_max) { score += 40; reasons.push("Within budget"); }
      else if (p.price <= lead.budget_max * 1.1) { score += 15; reasons.push("Slightly above budget"); }
      else return null;
    }
    if (lead.property_type && p.category === lead.property_type) { score += 20; reasons.push("Matching type"); }
    if (area) {
      const loc = `${p.location ?? ""} ${p.emirate ?? ""}`.toLowerCase();
      if (loc.includes(area)) {
        score += 20;
        reasons.push("Preferred area");
      }
    }
    if (lead.bedrooms != null && p.bedrooms != null) {
      if (p.bedrooms === lead.bedrooms) { score += 20; reasons.push("Exact bedrooms"); }
      else if (Math.abs(p.bedrooms - lead.bedrooms) === 1) { score += 10; reasons.push("Bedrooms +/-1"); }
    }
    return { ...p, match_score: score, match_reasons: reasons };
  });
  return scored
    .filter((p): p is NonNullable<typeof p> => p !== null && p.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, limit);
}

/** Visibility-scoped lookup of a lead. Returns undefined when the user cannot see it. */
export function visibleLead(user: CurrentUser, id: number): Row | undefined {
  const scope = ownerScope(user, "assigned_to", "branch_id", { unassignedVisible: true });
  return db().prepare(`SELECT * FROM leads WHERE id = ? AND ${scope.sql}`).get(id, ...scope.params) as Row | undefined;
}

/** Moves children of `sourceId` onto `targetId`, then deletes the source (audited). */
export function mergeLeads(user: CurrentUser, targetId: number, sourceId: number) {
  const target = db().prepare("SELECT * FROM leads WHERE id = ?").get(targetId) as Row | undefined;
  const source = db().prepare("SELECT * FROM leads WHERE id = ?").get(sourceId) as Row | undefined;
  if (!target || !source) throw new ApiError(404, "Lead not found.");
  if (target.id === source.id) throw new ApiError(400, "Cannot merge a lead into itself.");
  const d = db();
  for (const table of ["activities", "tasks", "viewings", "deals", "documents"]) {
    d.prepare(`UPDATE ${table} SET lead_id = ? WHERE lead_id = ?`).run(targetId, sourceId);
  }
  // Fill blanks on the target from the source.
  const fill = ["phone", "phone_norm", "email", "email_norm", "nationality", "preferred_area", "campaign", "portal_ref"];
  const updates: Row = {};
  for (const f of fill) if (!target[f] && source[f]) updates[f] = source[f];
  if (Object.keys(updates).length) {
    d.prepare(`UPDATE leads SET ${Object.keys(updates).map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
      .run(...Object.values(updates), nowIso(), targetId);
  }
  d.prepare("DELETE FROM leads WHERE id = ?").run(sourceId);
  logActivity({ leadId: targetId, kind: "system", body: `Merged duplicate lead #${sourceId} (${source.name}) into this record.`, userId: user.id });
  audit(user.id, "merge", "lead", targetId, { source_id: sourceId, source_name: source.name });
}

export function validateStatus(status: unknown): string {
  const allowed = settings().lead_stages;
  return oneOf(status, allowed as unknown as readonly string[], "status");
}

import { db, Row } from "./db";
import { audit } from "./audit";
import { nowIso } from "./util";
import { ownerScope, can, type CurrentUser } from "./permissions";
import { logActivity } from "./leads";

export const DEAL_STAGES = [
  "offer_submitted", "offer_accepted", "reserved", "documents_pending", "contract_signed", "closed_won", "closed_lost",
] as const;
export const OPEN_DEAL_STAGES = DEAL_STAGES.slice(0, 5);
export const DEAL_TYPES = ["sale", "rental", "off_plan", "secondary"] as const;
export const APPROVABLE_COMMISSION_STAGES = ["contract_signed", "closed_won"];
export const OFFER_STATUSES = ["submitted", "countered", "accepted", "rejected", "withdrawn"] as const;

/** Finance users only see deals that have reached signature or closed won. */
export function dealScope(user: CurrentUser) {
  if (user.role === "finance") {
    return { sql: "d.stage IN ('contract_signed','closed_won')", params: [] as (string | number | null)[] };
  }
  return ownerScope(user, "d.agent_id", "d.branch_id");
}

export function visibleDeal(user: CurrentUser, id: number): Row | undefined {
  if (!can(user, "deals:read") && !can(user, "deals:write")) return undefined;
  const scope = dealScope(user);
  return db().prepare(`SELECT d.* FROM deals d WHERE d.id = ? AND ${scope.sql}`).get(id, ...scope.params) as Row | undefined;
}

export function commissionFor(value: number, percent: number) {
  return Math.round(value * percent) / 100;
}

/** Keeps lead and listing status in step with the deal stage. */
export function syncDealEffects(user: CurrentUser, deal: Row, stage: string, lostReason: string | null) {
  const now = nowIso();
  const listingType = db().prepare("SELECT listing_type FROM properties WHERE id = ?").get(deal.property_id) as Row | undefined;
  if (stage === "closed_won") {
    db().prepare("UPDATE leads SET status = 'won', updated_at = ? WHERE id = ?").run(now, deal.lead_id);
    db().prepare("UPDATE properties SET status = ?, updated_at = ? WHERE id = ?")
      .run(listingType?.listing_type === "rent" ? "rented" : "sold", now, deal.property_id);
  } else if (stage === "closed_lost") {
    db().prepare("UPDATE leads SET status = 'lost', lost_reason = ?, updated_at = ? WHERE id = ?").run(lostReason, now, deal.lead_id);
    db().prepare("UPDATE properties SET status = 'active', updated_at = ? WHERE id = ? AND status IN ('under_offer','reserved')")
      .run(now, deal.property_id);
  } else {
    db().prepare("UPDATE leads SET status = 'offer_submitted', updated_at = ? WHERE id = ? AND status NOT IN ('won','lost')")
      .run(now, deal.lead_id);
    const propStatus = stage === "reserved" ? "reserved" : "under_offer";
    db().prepare("UPDATE properties SET status = ?, updated_at = ? WHERE id = ? AND status IN ('active','reserved','under_offer')")
      .run(propStatus, now, deal.property_id);
  }
  logActivity({ leadId: deal.lead_id, propertyId: deal.property_id, dealId: deal.id, kind: "status_change", userId: user.id,
    body: `Deal stage: ${deal.stage} → ${stage}${lostReason ? ` (${lostReason})` : ""}` });
  audit(user.id, "stage_change", "deal", deal.id, { from: deal.stage, to: stage, lost_reason: lostReason });
}

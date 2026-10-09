import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, idParam, readJson } from "@/lib/http";
import { ApiError, nowIso, num, oneOf, str } from "@/lib/util";
import { requirePerm } from "@/lib/permissions";
import { OFFER_STATUSES, visibleDeal } from "@/lib/deals";
import { logActivity } from "@/lib/leads";

/** Records an offer, counter-offer or status change on a deal. */
export const POST = api(async (req, user, p) => {
  requirePerm(user, "deals:write");
  const deal = visibleDeal(user, idParam(p.id)) as Row | undefined;
  if (!deal) throw new ApiError(404, "Deal not found.");
  const body = await readJson(req);
  const status = oneOf(body.status ?? "submitted", OFFER_STATUSES, "offer status");
  const amount = num(body.amount);
  if (amount === null || amount <= 0) throw new ApiError(400, "Offer amount is required.");
  const counter = num(body.counter_amount);
  tx(() => {
    const now = nowIso();
    const res = db().prepare(
      `INSERT INTO offers (deal_id, amount, counter_amount, terms, status, buyer_party, seller_party, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(deal.id, amount, counter, str(body.terms), status, str(body.buyer_party), str(body.seller_party), user.id, now);
    db().prepare("UPDATE deals SET updated_at = ? WHERE id = ?").run(now, deal.id);
    logActivity({ leadId: deal.lead_id, propertyId: deal.property_id, dealId: deal.id, kind: "note", userId: user.id,
      body: `Offer ${status}: ${amount}${counter ? ` (counter ${counter})` : ""}` });
    audit(user.id, "offer", "deal", deal.id, { offer_id: Number(res.lastInsertRowid), amount, status });
  });
  return { ok: true };
});

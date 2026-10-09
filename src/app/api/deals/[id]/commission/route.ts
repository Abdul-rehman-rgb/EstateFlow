import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, idParam, readJson } from "@/lib/http";
import { ApiError, nowIso, oneOf } from "@/lib/util";
import { requirePerm } from "@/lib/permissions";
import { APPROVABLE_COMMISSION_STAGES, visibleDeal } from "@/lib/deals";

/** Commission workflow: pending -> approved (finance/owner) -> paid (finance). */
export const POST = api(async (req, user, p) => {
  requirePerm(user, "commission:approve");
  const deal = visibleDeal(user, idParam(p.id)) as Row | undefined;
  if (!deal) throw new ApiError(404, "Deal not found.");
  const body = await readJson(req);
  const action = oneOf(body.action, ["approve", "paid"] as const, "action");
  if (action === "approve") {
    if (deal.commission_status !== "pending") throw new ApiError(409, "Commission is already approved or paid.");
    if (!APPROVABLE_COMMISSION_STAGES.includes(deal.stage)) throw new ApiError(409, "Commission can be approved once the contract is signed.");
  } else {
    if (deal.commission_status !== "approved") throw new ApiError(409, "Only approved commissions can be marked paid.");
  }
  tx(() => {
    if (action === "approve") {
      db().prepare("UPDATE deals SET commission_status = 'approved', commission_approved_by = ?, updated_at = ? WHERE id = ?")
        .run(user.id, nowIso(), deal.id);
    } else {
      db().prepare("UPDATE deals SET commission_status = 'paid', updated_at = ? WHERE id = ?").run(nowIso(), deal.id);
    }
    audit(user.id, `commission_${action}`, "deal", deal.id, { amount: deal.commission_amount });
  });
  return db().prepare("SELECT * FROM deals WHERE id = ?").get(deal.id);
});

import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, idParam, readJson } from "@/lib/http";
import { ApiError, int, nowIso, num, oneOf, str } from "@/lib/util";
import { requirePerm } from "@/lib/permissions";
import { commissionFor, DEAL_STAGES, syncDealEffects, visibleDeal } from "@/lib/deals";
import { settings } from "@/lib/db";

function detail(id: number) {
  const d = db();
  const deal = d.prepare(
    `SELECT d.*, l.name AS lead_name, l.phone AS lead_phone, p.ref AS property_ref, p.title AS property_title,
            p.price AS list_price, u.name AS agent_name
     FROM deals d LEFT JOIN leads l ON l.id = d.lead_id LEFT JOIN properties p ON p.id = d.property_id
     LEFT JOIN users u ON u.id = d.agent_id WHERE d.id = ?`,
  ).get(id) as Row;
  return {
    ...deal,
    stages: DEAL_STAGES,
    offers: d.prepare("SELECT * FROM offers WHERE deal_id = ? ORDER BY created_at DESC").all(id),
    tasks: d.prepare(
      "SELECT t.*, u.name AS assignee_name FROM tasks t JOIN users u ON u.id = t.assigned_to WHERE t.deal_id = ? ORDER BY t.status, t.due_at",
    ).all(id),
    documents: d.prepare(
      "SELECT id, kind, title, original_name, version, approval_status, expires_at, sensitive, created_at FROM documents WHERE deal_id = ? ORDER BY created_at DESC",
    ).all(id),
  };
}

export const GET = api(async (_req, user, p) => {
  const deal = visibleDeal(user, idParam(p.id));
  if (!deal) throw new ApiError(404, "Deal not found.");
  return detail(deal.id);
});

export const PATCH = api(async (req, user, p) => {
  requirePerm(user, "deals:write");
  const id = idParam(p.id);
  const deal = visibleDeal(user, id) as Row | undefined;
  if (!deal) throw new ApiError(404, "Deal not found.");
  if (user.role === "finance") throw new ApiError(403, "Finance users can view approved deals only.");
  const body = await readJson(req);
  const changes: Row = {};

  if (body.deal_value !== undefined) changes.deal_value = num(body.deal_value) ?? 0;
  if (body.commission_percent !== undefined) {
    const pct = num(body.commission_percent);
    if (pct === null || pct < 0 || pct > 100) throw new ApiError(400, "Commission percent must be between 0 and 100.");
    changes.commission_percent = pct;
  }
  if (changes.deal_value !== undefined || changes.commission_percent !== undefined) {
    const value = changes.deal_value ?? deal.deal_value;
    const pct = changes.commission_percent ?? deal.commission_percent;
    changes.commission_amount = commissionFor(value, pct);
    // Any change to the amount invalidates an earlier approval.
    if (deal.commission_status !== "pending") {
      changes.commission_status = "pending";
      changes.commission_approved_by = null;
    }
  }
  if (body.reservation_amount !== undefined) changes.reservation_amount = num(body.reservation_amount);
  if (body.reservation_expires_at !== undefined) changes.reservation_expires_at = body.reservation_expires_at ? new Date(String(body.reservation_expires_at)).toISOString() : null;
  if (body.expected_close_date !== undefined) changes.expected_close_date = body.expected_close_date ? new Date(String(body.expected_close_date)).toISOString() : null;

  let stageChange: string | null = null;
  let lostReason: string | null = null;
  if (body.stage !== undefined && body.stage !== deal.stage) {
    stageChange = oneOf(body.stage, DEAL_STAGES, "stage");
    if (stageChange === "closed_won" && !["contract_signed"].includes(deal.stage)) {
      throw new ApiError(409, "A deal can be closed won only after the contract is signed.");
    }
    if (stageChange === "closed_lost") {
      lostReason = oneOf(body.lost_reason, settings().lost_reasons, "lost reason");
      changes.lost_reason = lostReason;
      changes.closed_at = nowIso();
    } else if (["closed_won"].includes(stageChange)) {
      changes.closed_at = nowIso();
      changes.lost_reason = null;
    } else {
      changes.closed_at = null;
      changes.lost_reason = null;
    }
    changes.stage = stageChange;
  }

  if (Object.keys(changes).length === 0) return detail(id);
  tx(() => {
    const keys = Object.keys(changes);
    db().prepare(`UPDATE deals SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
      .run(...keys.map((k) => changes[k] ?? null), nowIso(), id);
    if (stageChange) syncDealEffects(user, deal, stageChange, lostReason);
    else audit(user.id, "update", "deal", id, { fields: keys });
  });
  return detail(id);
});

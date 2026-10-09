import { db, Row, settings } from "@/lib/db";
import { api } from "@/lib/http";
import { nowIso, addDays, addHours } from "@/lib/util";
import { ownerScope, inventoryScope, scopeOf } from "@/lib/permissions";
import { dealScope, OPEN_DEAL_STAGES } from "@/lib/deals";

/**
 * Role-aware home: KPIs are limited to what the caller can see. Filters: from, to, source, agent_id.
 */
export const GET = api(async (req, user) => {
  const qp = new URL(req.url).searchParams;
  const now = nowIso();
  const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const d = db();

  const ls = ownerScope(user, "l.assigned_to", "l.branch_id", { unassignedVisible: true });
  const leadFilters = [ls.sql];
  const leadParams: (string | number | null)[] = [...ls.params];
  if (qp.get("from")) { leadFilters.push("l.created_at >= ?"); leadParams.push(new Date(qp.get("from")!).toISOString()); }
  if (qp.get("to")) { leadFilters.push("l.created_at <= ?"); leadParams.push(new Date(qp.get("to")!).toISOString()); }
  if (qp.get("source")) { leadFilters.push("l.source = ?"); leadParams.push(qp.get("source")!); }
  if (qp.get("agent_id")) { leadFilters.push("l.assigned_to = ?"); leadParams.push(Number(qp.get("agent_id"))); }
  const leadWhere = leadFilters.join(" AND ");
  const hoursSla = settings().sla_first_response_hours;

  const count = (sql: string, params: (string | number | null)[] = []) => (d.prepare(sql).get(...params) as Row).c as number;
  const isFinanceOnly = user.role === "finance";

  const kpis: Record<string, number> = {};
  if (!isFinanceOnly) {
    kpis.new_leads = count(`SELECT COUNT(*) AS c FROM leads l WHERE ${leadWhere} AND l.status = 'new'`, leadParams);
    kpis.uncontacted_leads = count(
      `SELECT COUNT(*) AS c FROM leads l WHERE ${leadWhere} AND l.first_response_at IS NULL AND l.status IN ('new','assigned')`,
      leadParams,
    );
    kpis.sla_breaches = count(
      `SELECT COUNT(*) AS c FROM leads l WHERE ${leadWhere} AND l.first_response_at IS NULL AND l.status IN ('new','assigned') AND l.created_at < ?`,
      [...leadParams, addHours(now, -hoursSla)],
    );
    const ts = ownerScope(user, "t.assigned_to", "t.branch_id");
    kpis.overdue_followups = count(`SELECT COUNT(*) AS c FROM tasks t WHERE t.status = 'open' AND t.due_at < ? AND ${ts.sql}`, [now, ...ts.params]);
    const vs = ownerScope(user, "v.agent_id", "v.branch_id");
    kpis.viewings_today = count(
      `SELECT COUNT(*) AS c FROM viewings v WHERE v.status = 'scheduled' AND v.scheduled_at BETWEEN ? AND ? AND ${vs.sql}`,
      [startOfDay.toISOString(), endOfDay.toISOString(), ...vs.params],
    );
    const ps = inventoryScope(user);
    kpis.active_listings = count(`SELECT COUNT(*) AS c FROM properties WHERE status = 'active' AND ${ps.sql}`, ps.params);
  }
  const ds = dealScope(user);
  const dealPh = OPEN_DEAL_STAGES.map(() => "?").join(",");
  kpis.deals_in_progress = count(`SELECT COUNT(*) AS c FROM deals d WHERE d.stage IN (${dealPh}) AND ${ds.sql}`, [...OPEN_DEAL_STAGES, ...ds.params]);
  kpis.closed_deals = count(`SELECT COUNT(*) AS c FROM deals d WHERE d.stage = 'closed_won' AND ${ds.sql}`, ds.params);
  const comm = d.prepare(
    `SELECT COALESCE(SUM(CASE WHEN d.stage IN (${dealPh}) THEN d.commission_amount ELSE 0 END),0) AS expected,
            COALESCE(SUM(CASE WHEN d.commission_status = 'approved' THEN d.commission_amount ELSE 0 END),0) AS approved,
            COALESCE(SUM(CASE WHEN d.commission_status = 'paid' THEN d.commission_amount ELSE 0 END),0) AS paid
     FROM deals d WHERE ${ds.sql}`,
  ).get(...OPEN_DEAL_STAGES, ...ds.params) as Row;
  kpis.expected_commission = comm.expected;
  kpis.commission_approved = comm.approved;
  kpis.commission_paid = comm.paid;

  const activity = isFinanceOnly ? [] : d.prepare(
    `SELECT a.id, a.kind, a.outcome, a.body, a.created_at, l.name AS lead_name, l.id AS lead_id, u.name AS user_name
     FROM activities a JOIN leads l ON l.id = a.lead_id LEFT JOIN users u ON u.id = a.user_id
     WHERE a.lead_id IN (SELECT l.id FROM leads l WHERE ${ls.sql}) ORDER BY a.created_at DESC LIMIT 15`,
  ).all(...ls.params);

  const ts2 = ownerScope(user, "t.assigned_to", "t.branch_id");
  const tasks = d.prepare(
    `SELECT t.*, l.name AS lead_name FROM tasks t LEFT JOIN leads l ON l.id = t.lead_id
     WHERE t.status = 'open' AND ${ts2.sql} ORDER BY t.due_at IS NULL, t.due_at LIMIT 10`,
  ).all(...ts2.params);

  const vs2 = ownerScope(user, "v.agent_id", "v.branch_id");
  const upcomingViewings = isFinanceOnly ? [] : d.prepare(
    `SELECT v.*, p.ref AS property_ref, l.name AS lead_name FROM viewings v
     JOIN properties p ON p.id = v.property_id JOIN leads l ON l.id = v.lead_id
     WHERE v.status = 'scheduled' AND v.scheduled_at BETWEEN ? AND ? AND ${vs2.sql} ORDER BY v.scheduled_at LIMIT 10`,
  ).all(now, addDays(now, 2), ...vs2.params);

  const ps2 = inventoryScope(user);
  const expiringListings = isFinanceOnly ? [] : d.prepare(
    `SELECT id, ref, title, listing_expires_at AS expires_at, 'listing' AS kind FROM properties
     WHERE status = 'active' AND listing_expires_at IS NOT NULL AND listing_expires_at <= ? AND ${ps2.sql}
     ORDER BY listing_expires_at LIMIT 10`,
  ).all(addDays(now, 14), ...ps2.params);

  const docScope = `(d.lead_id IN (SELECT id FROM leads l WHERE ${ls.sql}) OR d.property_id IN (SELECT id FROM properties WHERE ${ps2.sql}) OR d.deal_id IN (SELECT d.id FROM deals d WHERE ${ds.sql}))`;
  const expiringDocs = d.prepare(
    `SELECT d.id, d.title, d.expires_at, d.kind FROM documents d
     WHERE d.expires_at IS NOT NULL AND d.expires_at <= ? AND ${docScope} ORDER BY d.expires_at LIMIT 10`,
  ).all(addDays(now, 30), ...ls.params, ...ps2.params, ...ds.params);

  return {
    role: user.role,
    scope: scopeOf(user),
    kpis,
    activity,
    tasks,
    upcoming_viewings: upcomingViewings,
    expiring: { listings: expiringListings, documents: expiringDocs },
  };
});

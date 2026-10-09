import { db, Row, settings } from "./db";
import { ApiError, nowIso } from "./util";
import { ownerScope, type CurrentUser } from "./permissions";
import { dealScope, OPEN_DEAL_STAGES } from "./deals";

export type Report = { title: string; columns: string[]; rows: Record<string, unknown>[] };

const q = <T = Row>(sql: string, params: (string | number | null)[] = []) =>
  db().prepare(sql).all(...params) as T[];
const one = (sql: string, params: (string | number | null)[] = []) =>
  (db().prepare(sql).get(...params) ?? {}) as Row;

function leads(user: CurrentUser) {
  const s = ownerScope(user, "l.assigned_to", "l.branch_id", { unassignedVisible: true });
  return { where: s.sql, params: s.params };
}
function deals(user: CurrentUser) {
  const s = dealScope(user);
  return { where: s.sql, params: s.params };
}
const QUALIFIED = ["qualified", "viewing_scheduled", "offer_submitted", "won"];

export const REPORTS = {
  funnel: (user: CurrentUser): Report => {
    const l = leads(user);
    const base = `FROM leads l WHERE ${l.where}`;
    const total = one(`SELECT COUNT(*) AS c ${base}`, l.params).c;
    const responded = one(`SELECT COUNT(*) AS c ${base} AND first_response_at IS NOT NULL`, l.params).c;
    const qualified = one(`SELECT COUNT(*) AS c ${base} AND status IN (${QUALIFIED.map(() => "?").join(",")})`, [...l.params, ...QUALIFIED]).c;
    const withViewings = one(
      `SELECT COUNT(DISTINCT v.lead_id) AS c FROM viewings v JOIN leads l ON l.id = v.lead_id WHERE ${l.where}`, l.params,
    ).c;
    const withDeals = one(
      `SELECT COUNT(DISTINCT d.lead_id) AS c FROM deals d JOIN leads l ON l.id = d.lead_id WHERE ${l.where}`, l.params,
    ).c;
    const won = one(`SELECT COUNT(*) AS c ${base} AND status = 'won'`, l.params).c;
    const rows = [
      { stage: "Leads received", count: total },
      { stage: "Contacted", count: responded },
      { stage: "Qualified or further", count: qualified },
      { stage: "Viewing held or booked", count: withViewings },
      { stage: "Offer / deal opened", count: withDeals },
      { stage: "Won", count: won },
    ];
    return { title: "Lead funnel", columns: ["stage", "count"], rows };
  },

  sla: (user: CurrentUser): Report => {
    const l = leads(user);
    const hours = settings().sla_first_response_hours;
    const base = `FROM leads l WHERE ${l.where}`;
    const responded = q<Row>(`SELECT created_at, first_response_at ${base} AND first_response_at IS NOT NULL`, l.params);
    const within = responded.filter((r) => (Date.parse(r.first_response_at) - Date.parse(r.created_at)) / 3_600_000 <= hours).length;
    const avgMin = responded.length
      ? Math.round(responded.reduce((s, r) => s + (Date.parse(r.first_response_at) - Date.parse(r.created_at)) / 60_000, 0) / responded.length)
      : 0;
    const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();
    const missed = one(`SELECT COUNT(*) AS c ${base} AND first_response_at IS NULL AND status NOT IN ('won','lost','nurture') AND created_at < ?`, [...l.params, cutoff]).c;
    const unassigned = one(`SELECT COUNT(*) AS c ${base} AND assigned_to IS NULL AND status NOT IN ('won','lost')`, l.params).c;
    const t = ownerScope(user, "t.assigned_to", "t.branch_id");
    const overdue = one(`SELECT COUNT(*) AS c FROM tasks t WHERE t.status = 'open' AND t.due_at < ? AND ${t.sql}`, [nowIso(), ...t.params]).c;
    return {
      title: "Lead response SLA",
      columns: ["metric", "value"],
      rows: [
        { metric: `Leads answered within ${hours} h`, value: `${within} of ${responded.length}` },
        { metric: "Average time to first response (min)", value: avgMin },
        { metric: `Untouched leads past ${hours} h SLA`, value: missed },
        { metric: "Unassigned open leads", value: unassigned },
        { metric: "Overdue follow-up tasks", value: overdue },
      ],
    };
  },

  sources: (user: CurrentUser): Report => {
    const l = leads(user);
    const rows = q<Row>(
      `SELECT COALESCE(l.source, 'Unknown') AS source, COUNT(*) AS leads,
        SUM(CASE WHEN l.status IN (${QUALIFIED.map(() => "?").join(",")}) THEN 1 ELSE 0 END) AS qualified,
        SUM(CASE WHEN l.status = 'won' THEN 1 ELSE 0 END) AS won
       FROM leads l WHERE ${l.where} GROUP BY COALESCE(l.source, 'Unknown') ORDER BY leads DESC`,
      [...QUALIFIED, ...l.params],
    );
    const values = q<Row>(
      `SELECT COALESCE(l.source, 'Unknown') AS source, SUM(d.deal_value) AS won_value FROM deals d
       JOIN leads l ON l.id = d.lead_id WHERE d.stage = 'closed_won' AND ${l.where} GROUP BY COALESCE(l.source, 'Unknown')`,
      l.params,
    );
    const byValue = Object.fromEntries(values.map((v) => [v.source, v.won_value]));
    return {
      title: "Source ROI",
      columns: ["source", "leads", "qualified", "won", "won_value"],
      rows: rows.map((r) => ({ ...r, won_value: byValue[r.source] ?? 0 })),
    };
  },

  agents: (user: CurrentUser): Report => {
    const u = ownerScope(user, "u.id", "u.branch_id");
    const agents = q<Row>(
      `SELECT u.id, u.name FROM users u WHERE u.role = 'agent' AND u.active = 1 AND ${u.sql} ORDER BY u.name`,
      u.params,
    );
    const rows = agents.map((a) => {
      const openLeads = one("SELECT COUNT(*) AS c FROM leads WHERE assigned_to = ? AND status NOT IN ('won','lost')", [a.id]).c;
      const viewings = one("SELECT COUNT(*) AS c FROM viewings WHERE agent_id = ? AND status = 'completed'", [a.id]).c;
      const offers = one("SELECT COUNT(*) AS c FROM deals WHERE agent_id = ? AND stage NOT IN ('closed_lost')", [a.id]).c;
      const won = one("SELECT COUNT(*) AS c, COALESCE(SUM(deal_value),0) AS v, COALESCE(SUM(commission_amount),0) AS comm FROM deals WHERE agent_id = ? AND stage = 'closed_won'", [a.id]);
      const assignedTotal = one("SELECT COUNT(*) AS c FROM leads WHERE assigned_to = ?", [a.id]).c;
      return {
        agent: a.name,
        open_leads: openLeads,
        viewings_completed: viewings,
        deals: offers,
        closed_won: won.c,
        closed_value: won.v,
        commission: won.comm,
        conversion_pct: assignedTotal ? Math.round((won.c / assignedTotal) * 1000) / 10 : 0,
      };
    });
    rows.sort((x, y) => Number(y.closed_value) - Number(x.closed_value));
    return {
      title: "Agent leaderboard",
      columns: ["agent", "open_leads", "viewings_completed", "deals", "closed_won", "closed_value", "commission", "conversion_pct"],
      rows,
    };
  },

  inventory: (user: CurrentUser): Report => {
    const s = user.role === "super_admin" || user.role === "owner" ? "1=1" : "branch_id = ?";
    const params = s === "1=1" ? [] : [user.branch_id];
    const rows = q<Row>(
      `SELECT status, COUNT(*) AS listings, COALESCE(SUM(price),0) AS total_value FROM properties WHERE ${s} GROUP BY status ORDER BY listings DESC`,
      params,
    );
    return { title: "Inventory by status", columns: ["status", "listings", "total_value"], rows };
  },

  pipeline: (user: CurrentUser): Report => {
    const d = deals(user);
    const rows = q<Row>(
      `SELECT COALESCE(substr(d.expected_close_date, 1, 7), 'Unscheduled') AS close_month, COUNT(*) AS deals,
        COALESCE(SUM(d.deal_value),0) AS value, COALESCE(SUM(d.commission_amount),0) AS expected_commission
       FROM deals d WHERE d.stage IN (${OPEN_DEAL_STAGES.map(() => "?").join(",")}) AND ${d.where}
       GROUP BY close_month ORDER BY close_month`,
      [...OPEN_DEAL_STAGES, ...d.params],
    );
    return { title: "Pipeline forecast", columns: ["close_month", "deals", "value", "expected_commission"], rows };
  },

  viewings: (user: CurrentUser): Report => {
    const s = ownerScope(user, "v.agent_id", "v.branch_id");
    const rows = q<Row>(
      `SELECT v.status, COALESCE(v.outcome, '—') AS outcome, COUNT(*) AS viewings FROM viewings v WHERE ${s.sql}
       GROUP BY v.status, COALESCE(v.outcome, '—') ORDER BY viewings DESC`,
      s.params,
    );
    return { title: "Viewing outcomes", columns: ["status", "outcome", "viewings"], rows };
  },

  commissions: (user: CurrentUser): Report => {
    const d = deals(user);
    const rows = q<Row>(
      `SELECT d.commission_status AS status, COUNT(*) AS deals, COALESCE(SUM(d.commission_amount),0) AS amount
       FROM deals d WHERE d.stage IN ('contract_signed','closed_won') AND ${d.where} GROUP BY d.commission_status`,
      d.params,
    );
    return { title: "Commission status", columns: ["status", "deals", "amount"], rows };
  },
};

export type ReportName = keyof typeof REPORTS;

export function buildReport(name: string, user: CurrentUser): Report {
  if (!(name in REPORTS)) throw new ApiError(404, "Unknown report.");
  return REPORTS[name as ReportName](user);
}

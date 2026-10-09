"use client";
import React from "react";
import Link from "next/link";
import { api, money, dateTime, relative, label } from "@/lib/client";
import { Kpi, PageHead, Spinner, Badge, Alert, Empty } from "@/components/ui";
import { getMeta, type Meta } from "@/components/meta";

type Dash = {
  role: string;
  kpis: Record<string, number>;
  activity: { id: number; kind: string; body: string; created_at: string; lead_name: string; lead_id: number; user_name: string | null }[];
  tasks: { id: number; title: string; due_at: string | null; priority: string; lead_name: string | null; lead_id: number | null }[];
  upcoming_viewings: { id: number; scheduled_at: string; property_ref: string; lead_name: string; mode: string }[];
  expiring: { listings: { id: number; ref: string; title: string; expires_at: string }[]; documents: { id: number; title: string; expires_at: string }[] };
};

export default function DashboardPage() {
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [data, setData] = React.useState<Dash | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState({ from: "", to: "", source: "", agent_id: "" });

  React.useEffect(() => { getMeta().then(setMeta).catch(() => undefined); }, []);
  const load = React.useCallback(() => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    api<Dash>(`/dashboard${qs ? `?${qs}` : ""}`).then(setData).catch((e) => setError(e.message));
  }, [filters]);
  React.useEffect(() => { load(); }, [load]);

  if (error) return <Alert>{error}</Alert>;
  if (!data || !meta) return <Spinner />;
  const k = data.kpis;
  const isFinance = data.role === "finance";
  const sources = meta.enums.lead_sources ?? [];

  return (
    <>
      <PageHead title={`Good to see you, ${meta.me.name.split(" ")[0]}`} subtitle={`${meta.me.role_label} · ${data.role === "agent" ? "your leads and listings" : "your scope"}`}>
        {meta.can.leads && <Link className="btn primary" href="/leads?new=1">+ Add lead</Link>}
        {meta.can.properties && <Link className="btn" href="/properties?new=1">+ Add property</Link>}
        {meta.can.viewings && <Link className="btn" href="/viewings?new=1">Schedule viewing</Link>}
        {meta.can.deals && <Link className="btn" href="/deals?new=1">New deal</Link>}
      </PageHead>

      {!isFinance && (
        <div className="toolbar" aria-label="Dashboard filters">
          <label className="field">From<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
          <label className="field">To<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
          <label className="field">Source
            <select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
              <option value="">All sources</option>
              {sources.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="field">Agent
            <select value={filters.agent_id} onChange={(e) => setFilters({ ...filters, agent_id: e.target.value })}>
              <option value="">All agents</option>
              {meta.users.filter((u) => u.role === "agent").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        </div>
      )}

      <section className="grid grid-kpi" style={{ marginBottom: 16 }} aria-label="Key figures">
        {!isFinance && <>
          <Kpi label="New leads" icon="leads" value={k.new_leads ?? 0} />
          <Kpi label="Uncontacted" icon="inbox" value={k.uncontacted_leads ?? 0} tone={k.uncontacted_leads ? "warn" : undefined} />
          <Kpi label="SLA breaches" icon="alert" value={k.sla_breaches ?? 0} tone={k.sla_breaches ? "danger" : undefined} />
          <Kpi label="Overdue follow-ups" icon="clock" value={k.overdue_followups ?? 0} tone={k.overdue_followups ? "danger" : undefined} />
          <Kpi label="Viewings today" icon="calendar" value={k.viewings_today ?? 0} />
          <Kpi label="Active listings" icon="building" value={k.active_listings ?? 0} />
        </>}
        <Kpi label="Deals in progress" icon="deals" value={k.deals_in_progress ?? 0} />
        <Kpi label="Closed deals" icon="check" value={k.closed_deals ?? 0} />
        <Kpi label="Expected commission" icon="money" value={money(k.expected_commission)} />
        <Kpi label="Commission approved" icon="shield" value={money(k.commission_approved)} />
        <Kpi label="Commission paid" icon="sparkle" value={money(k.commission_paid)} />
      </section>

      <div className="grid grid-2">
        <section className="card" aria-labelledby="tasks-h">
          <div className="row between" style={{ marginBottom: 8 }}>
            <h2 id="tasks-h">My tasks</h2>
            <Link href="/tasks" className="small">All tasks →</Link>
          </div>
          {data.tasks.length === 0 ? <Empty icon="check">No open tasks. Nice work.</Empty> : (
            <ul className="list">
              {data.tasks.map((t) => (
                <li key={t.id}>
                  <div className="row between">
                    <span style={{ fontWeight: 600 }}>{t.title}</span>
                    {t.priority !== "normal" && <Badge value={t.priority} tone={t.priority === "urgent" ? "danger" : "warn"} />}
                  </div>
                  <div className="small muted">
                    {t.due_at ? <span className={new Date(t.due_at) < new Date() ? "" : ""} style={new Date(t.due_at) < new Date() ? { color: "var(--danger)" } : undefined}>Due {relative(t.due_at)}</span> : "No due date"}
                    {t.lead_id && <> · <Link href={`/leads/${t.lead_id}`}>{t.lead_name}</Link></>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="view-h">
          <div className="row between" style={{ marginBottom: 8 }}>
            <h2 id="view-h">Upcoming viewings (48 h)</h2>
            <Link href="/viewings" className="small">Calendar →</Link>
          </div>
          {isFinance ? <Empty>Viewings are not shown for finance users.</Empty> : data.upcoming_viewings.length === 0 ? <Empty icon="calendar">No viewings in the next 48 hours.</Empty> : (
            <ul className="list">
              {data.upcoming_viewings.map((v) => (
                <li key={v.id}>
                  <div style={{ fontWeight: 600 }}>{dateTime(v.scheduled_at)}</div>
                  <div className="small muted">{v.property_ref} · {v.lead_name} · {label(v.mode)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {!isFinance && (
          <section className="card" aria-labelledby="act-h">
            <div className="row between" style={{ marginBottom: 8 }}>
              <h2 id="act-h">Recent activity</h2>
            </div>
            {data.activity.length === 0 ? <Empty>No activity yet.</Empty> : (
              <ul className="list timeline">
                {data.activity.map((a) => (
                  <li key={a.id}>
                    <span className="dot" aria-hidden />
                    <div>
                      <div><Link href={`/leads/${a.lead_id}`}>{a.lead_name}</Link> <span className="badge">{label(a.kind)}</span></div>
                      <div className="small">{a.body}</div>
                      <div className="small muted">{a.user_name ?? "System"} · {relative(a.created_at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="card" aria-labelledby="exp-h">
          <h2 id="exp-h">Expiring soon</h2>
          {data.expiring.listings.length + data.expiring.documents.length === 0 ? <Empty icon="clock">Nothing expiring in the next 14–30 days.</Empty> : (
            <ul className="list">
              {data.expiring.listings.map((l) => (
                <li key={`l${l.id}`}><Link href={`/properties/${l.id}`}>{l.ref} · {l.title}</Link> <div className="small muted">Listing expires {dateTime(l.expires_at)}</div></li>
              ))}
              {data.expiring.documents.map((d) => (
                <li key={`d${d.id}`}>{d.title} <div className="small muted">Document expires {dateTime(d.expires_at)}</div></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

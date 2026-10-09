"use client";
import React from "react";
import Link from "next/link";
import { api, money, label, relative } from "@/lib/client";
import { Alert, Badge, Empty, Field, PageHead, Spinner, useNotice } from "@/components/ui";
import { getMeta, type Meta } from "@/components/meta";

export default function DealsPage() {
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [deals, setDeals] = React.useState<any[] | null>(null);
  const [stages, setStages] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [view, setView] = React.useState<"board" | "list">("board");
  const { flash, node } = useNotice();
  const [form, setForm] = React.useState({ lead_id: "", property_id: "", offer_amount: "", commission_percent: "2" });
  const [showNew, setShowNew] = React.useState(false);
  const [leads, setLeads] = React.useState<any[]>([]);
  const [props, setProps] = React.useState<any[]>([]);

  React.useEffect(() => {
    getMeta().then(setMeta).catch(() => undefined);
    if (new URLSearchParams(window.location.search).get("new")) setShowNew(true);
    api<{ leads: any[] }>("/leads").then((r) => setLeads(r.leads)).catch(() => undefined);
    api<{ properties: any[] }>("/properties?status=active").then((r) => setProps(r.properties)).catch(() => undefined);
  }, []);
  const load = React.useCallback(() => {
    api<{ deals: any[]; stages: string[] }>("/deals").then((r) => { setDeals(r.deals); setStages(r.stages); }).catch((e) => setError(e.message));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const byStage = React.useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const s of stages) m[s] = [];
    for (const d of deals ?? []) (m[d.stage] ??= []).push(d);
    return m;
  }, [deals, stages]);

  const totals = React.useMemo(() => {
    const open = (deals ?? []).filter((d) => !["closed_won", "closed_lost"].includes(d.stage));
    return {
      value: open.reduce((s, d) => s + Number(d.deal_value), 0),
      commission: open.reduce((s, d) => s + Number(d.commission_amount), 0),
      won: (deals ?? []).filter((d) => d.stage === "closed_won").length,
    };
  }, [deals]);

  return (
    <>
      <PageHead title="Deals & pipeline" subtitle="Offers, reservations, signing and commissions.">
        <div className="row">
          <button className={`btn sm ${view === "board" ? "primary" : ""}`} onClick={() => setView("board")}>Board</button>
          <button className={`btn sm ${view === "list" ? "primary" : ""}`} onClick={() => setView("list")}>List</button>
          {meta?.can.deal_write && <button className="btn primary" onClick={() => setShowNew((s) => !s)}>{showNew ? "Close" : "+ New deal"}</button>}
        </div>
      </PageHead>
      {node}
      {error && <Alert>{error}</Alert>}

      <div className="grid grid-kpi" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="label">Open pipeline</div><div className="value" style={{ fontSize: 20 }}>{money(totals.value)}</div></div>
        <div className="card kpi"><div className="label">Expected commission</div><div className="value" style={{ fontSize: 20 }}>{money(totals.commission)}</div></div>
        <div className="card kpi"><div className="label">Closed won</div><div className="value">{totals.won}</div></div>
      </div>

      {showNew && meta?.can.deal_write && (
        <section className="card stack" style={{ marginBottom: 16 }} aria-labelledby="nd-h">
          <h2 id="nd-h">Open a deal</h2>
          <div className="grid grid-form">
            <Field label="Lead"><select value={form.lead_id} onChange={(e) => setForm({ ...form, lead_id: e.target.value })}><option value="">Select…</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
            <Field label="Listing (active)"><select value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })}><option value="">Select…</option>{props.map((p) => <option key={p.id} value={p.id}>{p.ref} · {p.title}</option>)}</select></Field>
            <Field label="Offer amount (AED)"><input type="number" value={form.offer_amount} onChange={(e) => setForm({ ...form, offer_amount: e.target.value })} /></Field>
            <Field label="Commission %"><input type="number" step="0.1" value={form.commission_percent} onChange={(e) => setForm({ ...form, commission_percent: e.target.value })} /></Field>
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => setShowNew(false)}>Cancel</button>
            <button className="btn primary" disabled={!form.lead_id || !form.property_id} onClick={async () => {
              try {
                await api("/deals", { method: "POST", json: { lead_id: Number(form.lead_id), property_id: Number(form.property_id), offer_amount: form.offer_amount ? Number(form.offer_amount) : undefined, commission_percent: Number(form.commission_percent) } });
                setShowNew(false); flash("Deal opened."); load();
              } catch (e) { setError((e as Error).message); }
            }}>Open deal</button>
          </div>
        </section>
      )}

      {!deals ? <Spinner /> : deals.length === 0 ? <div className="card"><Empty>No deals yet. Open one from a lead or with the button above.</Empty></div> : view === "board" ? (
        <div className="kanban" role="list" aria-label="Deal stages">
          {stages.map((s) => (
            <div className="kanban-col" key={s} role="listitem">
              <h3><span>{label(s)}</span><span className="badge">{byStage[s]?.length ?? 0}</span></h3>
              {(byStage[s] ?? []).map((d) => (
                <Link key={d.id} href={`/deals/${d.id}`} className="deal-card">
                  <div style={{ fontWeight: 600 }}>{d.property_ref}</div>
                  <div className="small muted">{d.lead_name}</div>
                  <div className="row between" style={{ marginTop: 6 }}>
                    <span className="num">{money(d.deal_value)}</span>
                    <span className="small muted">{relative(d.updated_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="card flush"><div className="table-wrap"><table>
          <thead><tr><th>Deal</th><th>Stage</th><th>Agent</th><th className="right">Value</th><th className="right">Commission</th><th>Commission status</th></tr></thead>
          <tbody>
            {deals.map((d) => (
              <tr key={d.id}>
                <td><Link href={`/deals/${d.id}`} style={{ fontWeight: 600 }}>{d.title}</Link><div className="small muted">{label(d.deal_type)}</div></td>
                <td><Badge value={d.stage} /></td>
                <td>{d.agent_name ?? "—"}</td>
                <td className="right num">{money(d.deal_value)}</td>
                <td className="right num">{money(d.commission_amount)} <span className="small muted">({d.commission_percent}%)</span></td>
                <td><Badge value={d.commission_status} /></td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
    </>
  );
}

"use client";
import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, dateOnly, dateTime, label, money, toIso } from "@/lib/client";
import { Alert, Badge, Empty, Field, Spinner, useNotice } from "@/components/ui";
import { UploadForm } from "@/components/upload-form";
import { getMeta, type Meta } from "@/components/meta";

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [d, setD] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [stage, setStage] = React.useState("");
  const [lostReason, setLostReason] = React.useState("");
  const [offer, setOffer] = React.useState({ amount: "", counter_amount: "", terms: "", status: "submitted", buyer_party: "", seller_party: "" });
  const { flash, node } = useNotice();

  const load = React.useCallback(() => {
    api(`/deals/${id}`).then((x) => { setD(x); setStage(x.stage); }).catch((e) => setError(e.message));
  }, [id]);
  React.useEffect(() => { getMeta().then(setMeta).catch(() => undefined); load(); }, [load]);

  if (error && !d) return <Alert>{error}</Alert>;
  if (!d || !meta) return <Spinner />;
  const canWrite = meta.can.deal_write;
  const canCommission = meta.can.commission;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); flash(ok); load(); } catch (e) { setError((e as Error).message); }
  };

  const moveStage = () => {
    if (stage === "closed_lost") {
      if (!lostReason) return setError("Choose a lost reason.");
      return run(() => api(`/deals/${id}`, { method: "PATCH", json: { stage, lost_reason: lostReason } }), "Deal closed as lost.");
    }
    run(() => api(`/deals/${id}`, { method: "PATCH", json: { stage } }), `Stage moved to ${label(stage)}.`);
  };

  return (
    <>
      <div className="small"><Link href="/deals">← Deals & pipeline</Link></div>
      <div className="page-head" style={{ marginTop: 6 }}>
        <div>
          <h1>{d.title}</h1>
          <div className="row" style={{ gap: 6 }}><Badge value={d.stage} /><span className="small muted">{label(d.deal_type)} · Agent {d.agent_name ?? "—"} · Opened {dateOnly(d.created_at)}</span></div>
        </div>
      </div>
      {node}
      {error && <Alert>{error}</Alert>}

      <div className="grid grid-kpi" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="label">Deal value</div><div className="value" style={{ fontSize: 20 }}>{money(d.deal_value)}</div></div>
        <div className="card kpi"><div className="label">Commission ({d.commission_percent}%)</div><div className="value" style={{ fontSize: 20 }}>{money(d.commission_amount)}</div></div>
        <div className="card kpi"><div className="label">Commission status</div><div className="value" style={{ fontSize: 18 }}><Badge value={d.commission_status} /></div></div>
        <div className="card kpi"><div className="label">Expected close</div><div className="value" style={{ fontSize: 18 }}>{dateOnly(d.expected_close_date)}</div></div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <section className="card" aria-labelledby="stage-h">
            <h2 id="stage-h">Stage</h2>
            {canWrite && !["closed_won", "closed_lost"].includes(d.stage) ? (
              <div className="row" style={{ alignItems: "end" }}>
                <Field label="Move to">
                  <select value={stage} onChange={(e) => setStage(e.target.value)}>
                    {d.stages.map((s: string) => <option key={s} value={s} disabled={s === "closed_won" && d.stage !== "contract_signed"}>{label(s)}</option>)}
                  </select>
                </Field>
                {stage === "closed_lost" && (
                  <Field label="Lost reason">
                    <select value={lostReason} onChange={(e) => setLostReason(e.target.value)}><option value="">Select…</option>{meta.settings.lost_reasons.map((r) => <option key={r}>{r}</option>)}</select>
                  </Field>
                )}
                <button className="btn primary" disabled={stage === d.stage} onClick={moveStage}>Update stage</button>
              </div>
            ) : (
              <p className="muted">{d.stage === "closed_won" ? "Closed won." : d.stage === "closed_lost" ? `Closed lost${d.lost_reason ? `: ${d.lost_reason}` : ""}.` : "You can view this deal but not change it."}</p>
            )}
            <div className="small muted" style={{ marginTop: 8 }}>Closed won is available once the contract is signed.</div>
            {d.reservation_amount && <p className="small" style={{ marginTop: 8 }}>Reservation {money(d.reservation_amount)} · expires {dateOnly(d.reservation_expires_at)}</p>}
          </section>

          <section className="card" aria-labelledby="off-h">
            <h2 id="off-h">Offers & counter-offers</h2>
            {d.offers.length === 0 ? <Empty>No offers recorded.</Empty> : (
              <div className="table-wrap"><table>
                <thead><tr><th>When</th><th className="right">Offer</th><th className="right">Counter</th><th>Status</th><th>Terms</th></tr></thead>
                <tbody>{d.offers.map((o: any) => (
                  <tr key={o.id}><td className="small">{dateTime(o.created_at)}</td><td className="right num">{money(o.amount)}</td><td className="right num">{money(o.counter_amount)}</td><td><Badge value={o.status} /></td><td className="small">{o.terms ?? "—"}</td></tr>
                ))}</tbody>
              </table></div>
            )}
            {canWrite && !["closed_won", "closed_lost"].includes(d.stage) && (
              <form className="stack" style={{ marginTop: 12 }} onSubmit={(e) => {
                e.preventDefault();
                run(() => api(`/deals/${id}/offers`, { method: "POST", json: { ...offer, amount: Number(offer.amount), counter_amount: offer.counter_amount ? Number(offer.counter_amount) : null } }), "Offer recorded.");
                setOffer({ amount: "", counter_amount: "", terms: "", status: "submitted", buyer_party: "", seller_party: "" });
              }}>
                <div className="grid grid-form">
                  <Field label="Offer (AED) *"><input type="number" required value={offer.amount} onChange={(e) => setOffer({ ...offer, amount: e.target.value })} /></Field>
                  <Field label="Counter (AED)"><input type="number" value={offer.counter_amount} onChange={(e) => setOffer({ ...offer, counter_amount: e.target.value })} /></Field>
                  <Field label="Status"><select value={offer.status} onChange={(e) => setOffer({ ...offer, status: e.target.value })}>{meta.enums.offer_statuses?.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></Field>
                  <Field label="Buyer"><input value={offer.buyer_party} onChange={(e) => setOffer({ ...offer, buyer_party: e.target.value })} /></Field>
                  <Field label="Seller"><input value={offer.seller_party} onChange={(e) => setOffer({ ...offer, seller_party: e.target.value })} /></Field>
                </div>
                <Field label="Terms"><input value={offer.terms} onChange={(e) => setOffer({ ...offer, terms: e.target.value })} placeholder="Payment plan, completion date, conditions" /></Field>
                <div className="form-actions"><button className="btn primary" disabled={!offer.amount}>Record offer</button></div>
              </form>
            )}
          </section>

          <section className="card" aria-labelledby="doc-h">
            <h2 id="doc-h">Documents</h2>
            {d.documents.length === 0 ? <Empty>No documents yet. Upload SPA, reservation form, IDs, and NOC.</Empty> : (
              <ul className="list">{d.documents.map((x: any) => (
                <li key={x.id}><a href={`/api/documents/${x.id}/download`}>{x.title}</a> <span className="small muted">{label(x.kind)} · v{x.version} · {label(x.approval_status)}</span></li>
              ))}</ul>
            )}
            {meta.can.documents_write && <UploadForm params={{ deal_id: d.id }} onDone={() => { flash("Document uploaded."); load(); }} />}
          </section>
        </div>

        <div className="stack">
          <section className="card" aria-labelledby="com-h">
            <h2 id="com-h">Commission</h2>
            <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 14px", margin: 0 }}>
              <dt className="muted">Rate</dt><dd style={{ margin: 0 }}>{d.commission_percent}% of {money(d.deal_value)}</dd>
              <dt className="muted">Amount</dt><dd style={{ margin: 0 }} className="num">{money(d.commission_amount)}</dd>
              <dt className="muted">Status</dt><dd style={{ margin: 0 }}><Badge value={d.commission_status} /></dd>
            </dl>
            {canCommission && (
              <div className="row" style={{ marginTop: 12 }}>
                {d.commission_status === "pending" && <button className="btn primary" disabled={!["contract_signed", "closed_won"].includes(d.stage)} onClick={() => run(() => api(`/deals/${id}/commission`, { method: "POST", json: { action: "approve" } }), "Commission approved.")}>Approve commission</button>}
                {d.commission_status === "approved" && <button className="btn primary" onClick={() => run(() => api(`/deals/${id}/commission`, { method: "POST", json: { action: "paid" } }), "Marked as paid.")}>Mark as paid</button>}
              </div>
            )}
            {canWrite && d.commission_status === "pending" && (
              <div className="grid grid-form" style={{ marginTop: 12 }}>
                <Field label="Deal value (AED)"><input type="number" defaultValue={d.deal_value} id="dv" /></Field>
                <Field label="Commission %"><input type="number" step="0.1" defaultValue={d.commission_percent} id="cp" /></Field>
                <Field label="Expected close"><input type="date" defaultValue={d.expected_close_date?.slice(0, 10) ?? ""} id="ec" /></Field>
                <div className="row" style={{ alignItems: "end" }}>
                  <button className="btn" onClick={() => { const ecValue = (document.getElementById("ec") as HTMLInputElement).value; run(() => api(`/deals/${id}`, { method: "PATCH", json: {
                    deal_value: Number((document.getElementById("dv") as HTMLInputElement).value),
                    commission_percent: Number((document.getElementById("cp") as HTMLInputElement).value),
                    expected_close_date: ecValue ? new Date(ecValue + "T00:00").toISOString() : null,
                  } }), "Deal terms saved."); }}>Save terms</button>
                </div>
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="pl-h">
            <h2 id="pl-h">Listing & lead</h2>
            <p><Link href={`/properties/${d.property_id}`}>{d.property_ref} · {d.property_title}</Link></p>
            {!canCommission && meta.me.role === "finance" ? null : <p><Link href={`/leads/${d.lead_id}`}>{d.lead_name}</Link> <span className="small muted">{d.lead_phone}</span></p>}
          </section>

          <section className="card" aria-labelledby="dt-h">
            <h2 id="dt-h">Deal tasks</h2>
            {d.tasks.length === 0 ? <Empty>No tasks linked to this deal.</Empty> : (
              <ul className="list">{d.tasks.map((t: any) => (
                <li key={t.id}><span style={{ fontWeight: 600 }}>{t.title}</span> <Badge value={t.status} /><div className="small muted">{t.assignee_name} · {dateTime(t.due_at)}</div></li>
              ))}</ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

"use client";
import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, dateOnly, dateTime, label, money } from "@/lib/client";
import { Alert, Badge, Empty, Field, Spinner, useNotice } from "@/components/ui";
import { UploadForm } from "@/components/upload-form";
import { getMeta, type Meta } from "@/components/meta";

const NEXT_STATUS: Record<string, string[]> = {
  draft: ["pending_approval", "archived"],
  pending_approval: [],
  active: ["reserved", "under_offer", "rented", "sold", "expired", "archived"],
  reserved: ["active", "under_offer", "sold", "rented"],
  under_offer: ["active", "sold", "rented"],
  expired: ["pending_approval", "archived"],
  sold: ["archived"],
  rented: ["archived", "active"],
  archived: ["draft"],
};

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [p, setP] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState<any>({});
  const { flash, node } = useNotice();

  const load = React.useCallback(() => {
    api(`/properties/${id}`).then(setP).catch((e) => setError(e.message));
  }, [id]);
  React.useEffect(() => { getMeta().then(setMeta).catch(() => undefined); load(); }, [load]);

  const act = async (body: any, ok: string) => {
    try { await api(`/properties/${id}/status`, { method: "POST", json: body }); flash(ok); load(); }
    catch (e) { setError((e as Error).message); }
  };

  if (error && !p) return <Alert>{error}</Alert>;
  if (!p || !meta) return <Spinner />;
  const canWrite = meta.can.properties;
  const canApprove = meta.can.approve;
  const next = NEXT_STATUS[p.status] ?? [];

  const save = async () => {
    const body: any = { ...form, exclusive: !!form.exclusive };
    for (const k of ["price", "size_sqft", "bedrooms", "bathrooms", "agreed_price"]) body[k] = form[k] === "" || form[k] == null ? null : Number(form[k]);
    try { await api(`/properties/${id}`, { method: "PATCH", json: body }); setEditing(false); flash("Listing updated."); load(); }
    catch (e) { setError((e as Error).message); }
  };
  const set = (k: string) => (e: React.ChangeEvent<any>) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  return (
    <>
      <div className="small"><Link href="/properties">← Properties</Link></div>
      <div className="page-head" style={{ marginTop: 6 }}>
        <div>
          <h1>{p.title}</h1>
          <div className="row" style={{ gap: 6 }}>
            <Badge value={p.status} /> <span className="small muted">{p.ref} · {label(p.listing_type)} · {label(p.category)} · {p.location ?? p.emirate}</span>
          </div>
        </div>
        <div className="row">
          {canWrite && p.status === "draft" && <button className="btn primary" onClick={() => act({ action: "submit" }, "Submitted for approval.")}>Submit for approval</button>}
          {canApprove && p.status === "pending_approval" && <>
            <button className="btn primary" onClick={() => act({ action: "approve" }, "Listing published.")}>Approve & publish</button>
            <button className="btn danger" onClick={() => { const note = prompt("Reason for returning to draft?") ?? ""; act({ action: "reject", note }, "Returned to draft."); }}>Return to draft</button>
          </>}
          {canWrite && p.status === "expired" && <button className="btn" onClick={() => act({ action: "submit" }, "Renewal submitted for approval.")}>Renew listing</button>}
          {canWrite && next.length > 0 && p.status !== "draft" && (
            <select aria-label="Change status" defaultValue="" onChange={(e) => { if (e.target.value) act({ action: "status", status: e.target.value }, `Status set to ${label(e.target.value)}.`); e.target.value = ""; }} style={{ width: "auto" }}>
              <option value="">Change status…</option>
              {next.filter((s) => s !== "active" || canApprove).map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          )}
        </div>
      </div>
      {node}
      {error && <Alert>{error}</Alert>}

      <div className="grid grid-kpi" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="label">Price</div><div className="value" style={{ fontSize: 18 }}>{money(p.price, p.currency)}</div></div>
        <div className="card kpi"><div className="label">Enquiries</div><div className="value">{p.performance.enquiries}</div></div>
        <div className="card kpi"><div className="label">Viewings</div><div className="value">{p.performance.viewings_completed}<span className="small muted"> / {p.performance.viewings}</span></div></div>
        <div className="card kpi"><div className="label">Deals</div><div className="value">{p.performance.deals}</div></div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <section className="card" aria-labelledby="det-h">
          <div className="row between" style={{ marginBottom: 8 }}>
            <h2 id="det-h" style={{ margin: 0 }}>Property details</h2>
            {canWrite && !editing && <button className="btn sm" onClick={() => { setForm({ ...p, exclusive: !!p.exclusive, permit_expiry: p.permit_expiry?.slice(0, 10) ?? "" }); setEditing(true); }}>Edit</button>}
          </div>
          {!editing ? (
            <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 14px", margin: 0 }}>
              <dt className="muted">Category</dt><dd style={{ margin: 0 }}>{label(p.category)} · {label(p.listing_type)} · {label(p.sale_mode)}</dd>
              <dt className="muted">Bedrooms / baths</dt><dd style={{ margin: 0 }}>{p.bedrooms ?? "—"} / {p.bathrooms ?? "—"}</dd>
              <dt className="muted">Size</dt><dd style={{ margin: 0 }}>{p.size_sqft ? `${Number(p.size_sqft).toLocaleString()} sq ft` : "—"}</dd>
              <dt className="muted">Location</dt><dd style={{ margin: 0 }}>{p.location ?? "—"}, {p.emirate}</dd>
              <dt className="muted">Description</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{p.description ?? "—"}</dd>
              <dt className="muted">Listing expires</dt><dd style={{ margin: 0 }}>{dateOnly(p.listing_expires_at)}</dd>
              <dt className="muted">Permit</dt><dd style={{ margin: 0 }}>{p.permit_number ?? "—"} {p.permit_expiry && <span className="small muted">expires {dateOnly(p.permit_expiry)}</span>}</dd>
              <dt className="muted">Listed by</dt><dd style={{ margin: 0 }}>{p.listed_by_name ?? "—"}</dd>
            </dl>
          ) : (
            <div className="stack">
              <div className="grid grid-form">
                <Field label="Title"><input value={form.title} onChange={set("title")} /></Field>
                <Field label="Price"><input type="number" value={form.price ?? ""} onChange={set("price")} /></Field>
                <Field label="Bedrooms"><input type="number" value={form.bedrooms ?? ""} onChange={set("bedrooms")} /></Field>
                <Field label="Bathrooms"><input type="number" value={form.bathrooms ?? ""} onChange={set("bathrooms")} /></Field>
                <Field label="Size (sq ft)"><input type="number" value={form.size_sqft ?? ""} onChange={set("size_sqft")} /></Field>
                <Field label="Location"><input value={form.location ?? ""} onChange={set("location")} /></Field>
                <Field label="Permit no."><input value={form.permit_number ?? ""} onChange={set("permit_number")} /></Field>
                <Field label="Permit expiry"><input type="date" value={form.permit_expiry ?? ""} onChange={set("permit_expiry")} /></Field>
              </div>
              <Field label="Description"><textarea value={form.description ?? ""} onChange={set("description")} /></Field>
              <div className="form-actions"><button className="btn" onClick={() => setEditing(false)}>Cancel</button><button className="btn primary" onClick={save}>Save</button></div>
            </div>
          )}
        </section>

        <div className="stack">
          <section className="card" aria-labelledby="owner-h">
            <h2 id="owner-h">Owner</h2>
            {meta.can.approve || meta.me.role === "agent" || meta.me.role === "team_leader" ? (
              <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 14px", margin: 0 }}>
                <dt className="muted">Name</dt><dd style={{ margin: 0 }}>{p.owner_name ?? "—"}</dd>
                <dt className="muted">Phone</dt><dd style={{ margin: 0 }}>{p.owner_phone ?? "—"}</dd>
                <dt className="muted">Agreed price</dt><dd style={{ margin: 0 }}>{money(p.agreed_price)}</dd>
                <dt className="muted">Exclusive</dt><dd style={{ margin: 0 }}>{p.exclusive ? "Yes" : "No"}</dd>
                <dt className="muted">Instructions</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{p.owner_instructions ?? "—"}</dd>
              </dl>
            ) : <Empty>Owner details are restricted to agents and managers.</Empty>}
          </section>

          <section className="card" aria-labelledby="pv-h">
            <h2 id="pv-h">Viewings</h2>
            {p.viewings.length === 0 ? <Empty>No viewings yet.</Empty> : (
              <ul className="list">
                {p.viewings.map((v: any) => (
                  <li key={v.id}>
                    <div className="row between"><span style={{ fontWeight: 600 }}>{v.lead_name}</span><Badge value={v.status} /></div>
                    <div className="small muted">{dateTime(v.scheduled_at)} · {label(v.mode)} · {v.agent_name ?? "—"}{v.outcome ? ` · ${label(v.outcome)}` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="pd-h">
            <h2 id="pd-h">Deals</h2>
            {p.deals.length === 0 ? <Empty>No deals on this listing.</Empty> : (
              <ul className="list">{p.deals.map((d: any) => <li key={d.id}><Link href={`/deals/${d.id}`}>{d.title}</Link> <Badge value={d.stage} /></li>)}</ul>
            )}
          </section>

          <section className="card" aria-labelledby="pdoc-h">
            <h2 id="pdoc-h">Media & documents</h2>
            {p.documents.length === 0 ? <Empty>No photos or documents yet.</Empty> : (
              <ul className="list">
                {p.documents.map((d: any) => (
                  <li key={d.id}><a href={`/api/documents/${d.id}/download`}>{d.title}</a> <span className="small muted">{label(d.kind)} · v{d.version}</span>
                    {canApprove && d.approval_status === "pending" && (
                      <span className="row" style={{ marginTop: 4 }}>
                        <button className="btn sm" onClick={async () => { await api(`/documents/${d.id}`, { method: "PATCH", json: { approval_status: "approved" } }); load(); }}>Approve</button>
                        <button className="btn sm danger" onClick={async () => { await api(`/documents/${d.id}`, { method: "PATCH", json: { approval_status: "rejected" } }); load(); }}>Reject</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {meta.can.documents_write && <UploadForm params={{ property_id: p.id }} onDone={() => { flash("Uploaded."); load(); }} />}
          </section>
        </div>
      </div>
    </>
  );
}

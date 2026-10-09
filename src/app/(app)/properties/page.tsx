"use client";
import React from "react";
import Link from "next/link";
import { api, dateOnly, label, money } from "@/lib/client";
import { Alert, Badge, Empty, Field, PageHead, Spinner, useNotice } from "@/components/ui";
import { getMeta, type Meta } from "@/components/meta";

const EMPTY = {
  title: "", category: "residential", listing_type: "sale", sale_mode: "secondary", price: "", size_sqft: "", bedrooms: "",
  bathrooms: "", emirate: "Dubai", location: "", description: "", owner_name: "", owner_phone: "", owner_instructions: "",
  exclusive: false, permit_number: "", permit_expiry: "",
};

export default function PropertiesPage() {
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [rows, setRows] = React.useState<any[] | null>(null);
  const [filters, setFilters] = React.useState({ q: "", status: "", category: "", listing_type: "", bedrooms: "", min_price: "", max_price: "" });
  const [showNew, setShowNew] = React.useState(false);
  const [form, setForm] = React.useState<any>(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { flash, node } = useNotice();

  React.useEffect(() => {
    getMeta().then(setMeta).catch(() => undefined);
    if (new URLSearchParams(window.location.search).get("new")) setShowNew(true);
  }, []);
  const load = React.useCallback(() => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    api<{ properties: any[] }>(`/properties${qs ? `?${qs}` : ""}`).then((r) => setRows(r.properties)).catch((e) => setError(e.message));
  }, [filters]);
  React.useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const body: any = { ...form, exclusive: !!form.exclusive };
      for (const k of ["price", "size_sqft", "bedrooms", "bathrooms"]) body[k] = form[k] === "" ? null : Number(form[k]);
      if (!body.permit_expiry) body.permit_expiry = null;
      await api("/properties", { method: "POST", json: body });
      setForm(EMPTY); setShowNew(false); flash("Property created as a draft. Submit it for approval from its page.");
      load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const set = (k: string) => (e: React.ChangeEvent<any>) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  return (
    <>
      <PageHead title="Properties" subtitle="Inventory, listing status and owner records.">
        {meta?.can.properties && <button className="btn primary" onClick={() => setShowNew((s) => !s)} aria-expanded={showNew}>{showNew ? "Close" : "+ New property"}</button>}
      </PageHead>
      {node}
      {error && <Alert>{error}</Alert>}

      {showNew && (
        <section className="card stack" style={{ marginBottom: 16 }} aria-labelledby="np-h">
          <h2 id="np-h">New property</h2>
          <div className="grid grid-form">
            <Field label="Title *"><input value={form.title} onChange={set("title")} /></Field>
            <Field label="Category"><select value={form.category} onChange={set("category")}>{meta?.enums.categories?.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select></Field>
            <Field label="Listing type"><select value={form.listing_type} onChange={set("listing_type")}><option value="sale">For sale</option><option value="rent">For rent</option></select></Field>
            <Field label="Sale mode"><select value={form.sale_mode} onChange={set("sale_mode")}><option value="secondary">Secondary market</option><option value="off_plan">Off-plan</option></select></Field>
            <Field label="Price (AED)"><input type="number" value={form.price} onChange={set("price")} /></Field>
            <Field label="Size (sq ft)"><input type="number" value={form.size_sqft} onChange={set("size_sqft")} /></Field>
            <Field label="Bedrooms"><input type="number" min={0} value={form.bedrooms} onChange={set("bedrooms")} /></Field>
            <Field label="Bathrooms"><input type="number" min={0} value={form.bathrooms} onChange={set("bathrooms")} /></Field>
            <Field label="Emirate"><input value={form.emirate} onChange={set("emirate")} /></Field>
            <Field label="Location / community"><input value={form.location} onChange={set("location")} /></Field>
            <Field label="Owner name"><input value={form.owner_name} onChange={set("owner_name")} /></Field>
            <Field label="Owner phone"><input value={form.owner_phone} onChange={set("owner_phone")} /></Field>
            <Field label="Advertising permit no."><input value={form.permit_number} onChange={set("permit_number")} /></Field>
            <Field label="Permit expiry"><input type="date" value={form.permit_expiry} onChange={set("permit_expiry")} /></Field>
          </div>
          <Field label="Description"><textarea value={form.description} onChange={set("description")} /></Field>
          <Field label="Owner instructions (private)"><textarea value={form.owner_instructions} onChange={set("owner_instructions")} /></Field>
          <label className="check"><input type="checkbox" checked={form.exclusive} onChange={set("exclusive")} /> Exclusive agreement</label>
          <div className="form-actions">
            <button className="btn" onClick={() => setShowNew(false)}>Cancel</button>
            <button className="btn primary" disabled={busy || !form.title} onClick={save}>{busy ? "Saving…" : "Save draft"}</button>
          </div>
        </section>
      )}

      <div className="toolbar" role="search">
        <label className="field grow">Search<input placeholder="Title, reference or location" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></label>
        <label className="field">Status<select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All</option>{meta?.enums.property_statuses?.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label>
        <label className="field">Category<select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}><option value="">All</option>{meta?.enums.categories?.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select></label>
        <label className="field">Listing<select value={filters.listing_type} onChange={(e) => setFilters({ ...filters, listing_type: e.target.value })}><option value="">Sale & rent</option><option value="sale">Sale</option><option value="rent">Rent</option></select></label>
        <label className="field">Bedrooms<input type="number" min={0} value={filters.bedrooms} onChange={(e) => setFilters({ ...filters, bedrooms: e.target.value })} /></label>
        <label className="field">Min price<input type="number" value={filters.min_price} onChange={(e) => setFilters({ ...filters, min_price: e.target.value })} /></label>
        <label className="field">Max price<input type="number" value={filters.max_price} onChange={(e) => setFilters({ ...filters, max_price: e.target.value })} /></label>
      </div>

      <div className="card flush">
        {!rows ? <div style={{ padding: 16 }}><Spinner /></div> : rows.length === 0 ? <Empty>No properties match these filters.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Listing</th><th>Price</th><th>Beds</th><th>Location</th><th>Status</th><th className="right">Enquiries</th><th>Expires</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/properties/${p.id}`} style={{ fontWeight: 600 }}>{p.title}</Link><div className="small muted">{p.ref} · {label(p.listing_type)} · {label(p.category)}{p.sale_mode === "off_plan" ? " · Off-plan" : ""}</div></td>
                  <td className="num">{money(p.price, p.currency)}</td>
                  <td>{p.bedrooms ?? "—"}</td>
                  <td>{p.location ?? "—"}<div className="small muted">{p.emirate}</div></td>
                  <td><Badge value={p.status} /></td>
                  <td className="right num">{p.enquiries}</td>
                  <td className="small">{dateOnly(p.listing_expires_at)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}

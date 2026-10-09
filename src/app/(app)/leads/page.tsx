"use client";
import React from "react";
import Link from "next/link";
import { api, HttpError, dateTime, label, relative } from "@/lib/client";
import { Alert, Badge, Empty, Field, PageHead, Spinner, useNotice } from "@/components/ui";
import { getMeta, type Meta } from "@/components/meta";

type Lead = {
  id: number; name: string; phone: string | null; email: string | null; source: string | null; status: string;
  assigned_name: string | null; assigned_to: number | null; score: number; band: string; created_at: string; first_response_at: string | null;
  purpose: string; budget_max: number | null;
};

const EMPTY_FORM = {
  name: "", phone: "", email: "", purpose: "buy", property_type: "", preferred_area: "", budget_min: "", budget_max: "",
  bedrooms: "", timeline: "", source: "", language: "English", nationality: "", campaign: "", assigned_to: "",
};

export default function LeadsPage() {
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [leads, setLeads] = React.useState<Lead[] | null>(null);
  const [filters, setFilters] = React.useState({ q: "", status: "", source: "", assigned: "" });
  const [showNew, setShowNew] = React.useState(false);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [duplicates, setDuplicates] = React.useState<any[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { flash, node } = useNotice();

  React.useEffect(() => {
    getMeta().then(setMeta).catch(() => undefined);
    if (new URLSearchParams(window.location.search).get("new")) setShowNew(true);
  }, []);

  const load = React.useCallback(() => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    api<{ leads: Lead[] }>(`/leads${qs ? `?${qs}` : ""}`).then((r) => setLeads(r.leads)).catch((e) => setError(e.message));
  }, [filters]);
  React.useEffect(() => { load(); }, [load]);

  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (allowDuplicate = false) => {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { ...form, allow_duplicate: allowDuplicate };
      for (const k of ["budget_min", "budget_max", "bedrooms", "assigned_to"]) {
        payload[k] = (form as any)[k] === "" ? null : Number((form as any)[k]);
      }
      for (const k of Object.keys(payload)) if (payload[k] === "") payload[k] = null;
      await api("/leads", { method: "POST", json: payload });
      setForm(EMPTY_FORM);
      setDuplicates(null);
      setShowNew(false);
      flash("Lead created.");
      load();
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) setDuplicates(err.details?.duplicates ?? []);
      else setError(err instanceof Error ? err.message : "Could not save lead.");
    } finally {
      setBusy(false);
    }
  };

  const agents = (meta?.users ?? []).filter((u) => u.role === "agent" || u.role === "team_leader" || u.role === "branch_manager");
  const canWrite = meta?.can.leads;

  return (
    <>
      <PageHead title="Leads" subtitle="Every enquiry in one inbox, ranked by priority.">
        <Link className="btn" href="/imports">Import CSV</Link>
        {canWrite && <button className="btn primary" onClick={() => setShowNew((s) => !s)} aria-expanded={showNew}>{showNew ? "Close" : "+ New lead"}</button>}
      </PageHead>
      {node}
      {error && <Alert>{error}</Alert>}

      {showNew && canWrite && (
        <section className="card stack" style={{ marginBottom: 16 }} aria-labelledby="new-lead-h">
          <h2 id="new-lead-h">New lead</h2>
          {duplicates && (
            <Alert kind="warn">
              <strong>Possible duplicate.</strong> A lead with the same phone or email already exists:
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {duplicates.map((d) => (
                  <li key={d.id}><Link href={`/leads/${d.id}`}>{d.name}</Link> · {d.phone ?? d.email} · {label(d.status)}</li>
                ))}
              </ul>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn sm" onClick={() => submit(true)} disabled={busy}>Create anyway</button>
                <span className="small">or open the existing record and merge from there.</span>
              </div>
            </Alert>
          )}
          <div className="grid grid-form">
            <Field label="Full name *"><input value={form.name} onChange={set("name")} required /></Field>
            <Field label="Phone" hint="UAE numbers may start with 05"><input value={form.phone} onChange={set("phone")} /></Field>
            <Field label="Email"><input type="email" value={form.email} onChange={set("email")} /></Field>
            <Field label="Purpose">
              <select value={form.purpose} onChange={set("purpose")}><option value="buy">Buy</option><option value="rent">Rent</option></select>
            </Field>
            <Field label="Property type">
              <select value={form.property_type} onChange={set("property_type")}>
                <option value="">Any</option>{meta?.enums.categories?.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </Field>
            <Field label="Preferred area"><input value={form.preferred_area} onChange={set("preferred_area")} placeholder="e.g. Marina" /></Field>
            <Field label="Budget min (AED)"><input type="number" min={0} value={form.budget_min} onChange={set("budget_min")} /></Field>
            <Field label="Budget max (AED)"><input type="number" min={0} value={form.budget_max} onChange={set("budget_max")} /></Field>
            <Field label="Bedrooms"><input type="number" min={0} value={form.bedrooms} onChange={set("bedrooms")} /></Field>
            <Field label="Timeline">
              <select value={form.timeline} onChange={set("timeline")}>
                <option value="">Unknown</option>{meta?.enums.timelines?.map((t) => <option key={t} value={t}>{label(t).replace(/_/g, " ")}</option>)}
              </select>
            </Field>
            <Field label="Source">
              <select value={form.source} onChange={set("source")}>
                <option value="">Select…</option>{meta?.enums.lead_sources?.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Campaign"><input value={form.campaign} onChange={set("campaign")} /></Field>
            <Field label="Language"><input value={form.language} onChange={set("language")} /></Field>
            <Field label="Assign to" hint={meta ? `Auto-assignment: ${label(meta.settings.assignment_mode)}` : undefined}>
              <select value={form.assigned_to} onChange={set("assigned_to")}>
                <option value="">Automatic</option>
                {agents.filter((a) => meta?.me.role !== "agent" || a.id === meta?.me.id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="small muted">A phone number or email is required. Duplicates are checked on save.</div>
          <div className="form-actions">
            <button className="btn" onClick={() => { setShowNew(false); setDuplicates(null); }}>Cancel</button>
            <button className="btn primary" disabled={busy || !form.name || (!form.phone && !form.email)} onClick={() => submit(false)}>
              {busy ? "Saving…" : "Save lead"}
            </button>
          </div>
        </section>
      )}

      <div className="toolbar" role="search">
        <label className="field grow">Search<input placeholder="Name, phone or email" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></label>
        <label className="field">Status
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All</option>{meta?.settings.lead_stages.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </label>
        <label className="field">Source
          <select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
            <option value="">All</option>{meta?.enums.lead_sources?.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="field">Assignment
          <select value={filters.assigned} onChange={(e) => setFilters({ ...filters, assigned: e.target.value })}>
            <option value="">Everyone</option><option value="unassigned">Unassigned</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      </div>

      <div className="card flush">
        {!leads ? <div style={{ padding: 16 }}><Spinner /></div> : leads.length === 0 ? <Empty>No leads match these filters.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Lead</th><th>Priority</th><th>Status</th><th>Source</th><th>Assigned to</th><th>Created</th><th>First response</th></tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/leads/${l.id}`} style={{ fontWeight: 600 }}>{l.name}</Link>
                      <div className="small muted">{[l.phone, l.email].filter(Boolean).join(" · ")}</div>
                      <div className="small muted">{label(l.purpose)}{l.budget_max ? ` · up to ${Number(l.budget_max).toLocaleString()}` : ""}</div>
                    </td>
                    <td><Badge value={l.band} tone={l.band === "High" ? "danger" : l.band === "Medium" ? "warn" : ""} /> <span className="small muted num">{l.score}</span></td>
                    <td><Badge value={l.status} /></td>
                    <td>{l.source ?? "—"}</td>
                    <td>{l.assigned_name ?? <span className="badge warn">Unassigned</span>}</td>
                    <td className="small">{relative(l.created_at)}</td>
                    <td className="small">{l.first_response_at ? dateTime(l.first_response_at) : <span className="badge danger">Not yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

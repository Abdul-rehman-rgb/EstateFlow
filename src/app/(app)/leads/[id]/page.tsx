"use client";
import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, HttpError, dateTime, label, money, relative, toIso, toLocalInput } from "@/lib/client";
import { Alert, Badge, Empty, Field, Spinner, useNotice } from "@/components/ui";
import { UploadForm } from "@/components/upload-form";
import { getMeta, type Meta } from "@/components/meta";

type Detail = any;

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [lead, setLead] = React.useState<Detail | null>(null);
  const [matches, setMatches] = React.useState<any[]>([]);
  const [properties, setProperties] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const { flash, node } = useNotice();

  const load = React.useCallback(() => {
    api(`/leads/${id}`).then(setLead).catch((e) => setError(e.message));
    api<{ matches: any[] }>(`/leads/${id}/matches`).then((r) => setMatches(r.matches)).catch(() => setMatches([]));
  }, [id]);
  React.useEffect(() => {
    getMeta().then(setMeta).catch(() => undefined);
    api<{ properties: any[] }>("/properties").then((r) => setProperties(r.properties)).catch(() => undefined);
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) flash(ok);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  if (error && !lead) return <Alert>{error}</Alert>;
  if (!lead || !meta) return <Spinner />;
  const canEdit = meta.can.leads;

  return (
    <>
      <div className="small"><Link href="/leads">← Leads</Link></div>
      <div className="page-head" style={{ marginTop: 6 }}>
        <div>
          <h1>{lead.name}</h1>
          <div className="row" style={{ gap: 6 }}>
            <Badge value={lead.status} />
            <Badge value={lead.band} tone={lead.band === "High" ? "danger" : lead.band === "Medium" ? "warn" : ""} />
            <span className="small muted">Priority {lead.score}/100</span>
            <span className="small muted">· Assigned to {lead.assigned_name ?? "nobody"}</span>
          </div>
        </div>
      </div>
      {node}
      {error && <Alert>{error}</Alert>}

      {lead.duplicates?.length > 0 && (
        <Alert kind="warn">
          <div className="row between">
            <span>Possible duplicate: {lead.duplicates.map((d: any) => <span key={d.id}><Link href={`/leads/${d.id}`}>{d.name}</Link> </span>)}</span>
            {canEdit && lead.duplicates.map((d: any) => (
              <button key={d.id} className="btn sm" onClick={() => {
                if (!confirm(`Merge ${d.name} into this lead? Their activities, viewings, tasks, deals and documents move here, and the duplicate is deleted.`)) return;
                run(() => api(`/leads/${id}/merge`, { method: "POST", json: { source_id: d.id } }), "Duplicate merged.");
              }}>Merge {d.name}</button>
            ))}
          </div>
        </Alert>
      )}

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <DetailsCard lead={lead} canEdit={canEdit} meta={meta} onSave={(body) => run(() => api(`/leads/${id}`, { method: "PATCH", json: body }), "Lead updated.")} />

          <section className="card" aria-labelledby="status-h">
            <h2 id="status-h">Pipeline & assignment</h2>
            <StatusForm lead={lead} meta={meta} disabled={!canEdit} onSave={(body) => run(() => api(`/leads/${id}`, { method: "PATCH", json: body }), "Status updated.")} />
            {canEdit && (
              <div style={{ marginTop: 12 }}>
                <Field label="Assigned agent">
                  <select value={lead.assigned_to ?? ""} onChange={(e) => run(() => api(`/leads/${id}/assign`, { method: "POST", json: { user_id: e.target.value ? Number(e.target.value) : null } }), "Assignment saved.")}>
                    <option value="">Unassigned</option>
                    {meta.users.filter((u) => ["agent", "team_leader", "branch_manager"].includes(u.role) && u.branch_id === lead.branch_id)
                      .map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </Field>
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="log-h">
            <h2 id="log-h">Activity timeline</h2>
            {canEdit && <LogForm onSave={(b) => run(() => api(`/leads/${id}/activities`, { method: "POST", json: b }), "Activity logged.")} />}
            {lead.activities.length === 0 ? <Empty>No activity yet.</Empty> : (
              <ul className="list timeline" style={{ marginTop: 12 }}>
                {lead.activities.map((a: any) => (
                  <li key={a.id}>
                    <span className="dot" aria-hidden />
                    <div>
                      <div className="row" style={{ gap: 6 }}><span className="badge">{label(a.kind)}</span>{a.outcome && <span className="badge accent">{label(a.outcome)}</span>}{a.duration_min && <span className="small muted">{a.duration_min} min</span>}</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{a.body}</div>
                      <div className="small muted">{a.user_name ?? "System"} · {dateTime(a.created_at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card" aria-labelledby="match-h">
            <h2 id="match-h">Matching listings</h2>
            {matches.length === 0 ? <Empty>No active listings match this lead's budget, area, type or bedrooms yet.</Empty> : (
              <ul className="list">
                {matches.map((m) => (
                  <li key={m.id}>
                    <div className="row between"><Link href={`/properties/${m.id}`} style={{ fontWeight: 600 }}>{m.ref} · {m.title}</Link><span className="badge accent">{m.match_score} pts</span></div>
                    <div className="small muted">{money(m.price, m.currency)} · {m.bedrooms ?? "—"} bed · {m.location ?? m.emirate}</div>
                    <div className="small muted">{m.match_reasons.join(" · ")}</div>
                    {canEdit && <ViewingQuick leadId={lead.id} propertyId={m.id} onDone={load} agents={meta.users.filter((u) => u.role === "agent")} />}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="view-h">
            <h2 id="view-h">Viewings</h2>
            {lead.viewings.length === 0 ? <Empty>No viewings yet.</Empty> : (
              <ul className="list">
                {lead.viewings.map((v: any) => (
                  <li key={v.id}>
                    <div className="row between"><span style={{ fontWeight: 600 }}>{v.property_ref} · {dateTime(v.scheduled_at)}</span><Badge value={v.status} /></div>
                    <div className="small muted">{label(v.mode)} · Agent {v.agent_name ?? "—"} {v.outcome && <>· Outcome: {label(v.outcome)}</>}</div>
                    {v.feedback && <div className="small">“{v.feedback}”</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="deal-h">
            <h2 id="deal-h">Deals</h2>
            {lead.deals.length === 0 ? <Empty>No deals yet.</Empty> : (
              <ul className="list">
                {lead.deals.map((d: any) => (
                  <li key={d.id}>
                    <div className="row between"><Link href={`/deals/${d.id}`} style={{ fontWeight: 600 }}>{d.title}</Link><Badge value={d.stage} /></div>
                    <div className="small muted">{money(d.deal_value)} · Commission {money(d.commission_amount)}</div>
                  </li>
                ))}
              </ul>
            )}
            {meta.can.deal_write && properties.length > 0 && <OpenDealForm leadId={lead.id} properties={properties.filter((p) => p.status === "active")} onDone={() => { flash("Deal opened."); load(); }} />}
          </section>

          <section className="card" aria-labelledby="task-h">
            <h2 id="task-h">Follow-up tasks</h2>
            {lead.tasks.length === 0 ? <Empty>No tasks for this lead.</Empty> : (
              <ul className="list">
                {lead.tasks.map((t: any) => (
                  <li key={t.id}>
                    <div className="row between"><span style={{ fontWeight: 600, textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.title}</span><Badge value={t.status} /></div>
                    <div className="small muted">{t.assignee_name} · {t.due_at ? `due ${dateTime(t.due_at)}` : "no due date"}</div>
                  </li>
                ))}
              </ul>
            )}
            {meta.can.tasks && <TaskForm leadId={lead.id} agents={meta.users} onDone={() => { flash("Task added."); load(); }} />}
          </section>

          <section className="card" aria-labelledby="docs-h">
            <h2 id="docs-h">Documents</h2>
            {lead.documents.length === 0 ? <Empty>No documents uploaded.</Empty> : (
              <ul className="list">
                {lead.documents.map((d: any) => (
                  <li key={d.id}>
                    <a href={`/api/documents/${d.id}/download`}>{d.title}</a> <span className="small muted">v{d.version}</span>
                    <div className="small muted">{label(d.kind)} · {label(d.approval_status)}{d.sensitive ? " · sensitive" : ""}</div>
                  </li>
                ))}
              </ul>
            )}
            {meta.can.documents_write && <UploadForm params={{ lead_id: lead.id }} onDone={() => { flash("Document uploaded."); load(); }} />}
          </section>
        </div>
      </div>
    </>
  );
}

function DetailsCard({ lead, canEdit, meta, onSave }: { lead: any; canEdit: boolean; meta: Meta; onSave: (b: any) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [f, setF] = React.useState<any>({});
  const start = () => {
    setF({ name: lead.name, phone: lead.phone ?? "", email: lead.email ?? "", source: lead.source ?? "", purpose: lead.purpose,
      property_type: lead.property_type ?? "", preferred_area: lead.preferred_area ?? "", budget_min: lead.budget_min ?? "",
      budget_max: lead.budget_max ?? "", bedrooms: lead.bedrooms ?? "", timeline: lead.timeline ?? "", language: lead.language ?? "",
      nationality: lead.nationality ?? "", campaign: lead.campaign ?? "", marketing_consent: !!lead.marketing_consent, opted_out: !!lead.opted_out });
    setEditing(true);
  };
  const save = () => {
    const body: any = { ...f };
    for (const k of ["budget_min", "budget_max", "bedrooms"]) body[k] = f[k] === "" ? null : Number(f[k]);
    for (const k of ["source", "property_type", "timeline", "phone", "email", "preferred_area", "nationality", "campaign"]) if (body[k] === "") body[k] = null;
    onSave(body);
    setEditing(false);
  };
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });
  return (
    <section className="card" aria-labelledby="details-h">
      <div className="row between" style={{ marginBottom: 8 }}>
        <h2 id="details-h" style={{ margin: 0 }}>Details</h2>
        {canEdit && !editing && <button className="btn sm" onClick={start}>Edit</button>}
      </div>
      {!editing ? (
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 14px", margin: 0 }}>
          <dt className="muted">Phone</dt><dd style={{ margin: 0 }}>{lead.phone ?? "—"}</dd>
          <dt className="muted">Email</dt><dd style={{ margin: 0 }}>{lead.email ?? "—"}</dd>
          <dt className="muted">Source</dt><dd style={{ margin: 0 }}>{lead.source ?? "—"} {lead.campaign && <span className="small muted">({lead.campaign})</span>}</dd>
          <dt className="muted">Looking to</dt><dd style={{ margin: 0 }}>{label(lead.purpose)} {label(lead.property_type)} · {lead.preferred_area ?? "any area"}</dd>
          <dt className="muted">Budget</dt><dd style={{ margin: 0 }}>{lead.budget_min ? `${money(lead.budget_min)} – ${money(lead.budget_max)}` : lead.budget_max ? `Up to ${money(lead.budget_max)}` : "—"}</dd>
          <dt className="muted">Bedrooms</dt><dd style={{ margin: 0 }}>{lead.bedrooms ?? "—"}</dd>
          <dt className="muted">Timeline</dt><dd style={{ margin: 0 }}>{lead.timeline ? label(lead.timeline).replace(/_/g, " ") : "—"}</dd>
          <dt className="muted">Language</dt><dd style={{ margin: 0 }}>{lead.language}</dd>
          <dt className="muted">Interested in</dt><dd style={{ margin: 0 }}>{lead.property_ref ? <Link href={`/properties/${lead.property_id}`}>{lead.property_ref} · {lead.property_title}</Link> : "—"}</dd>
          <dt className="muted">Marketing</dt><dd style={{ margin: 0 }}>{lead.opted_out ? <span className="badge danger">Opted out</span> : lead.marketing_consent ? <span className="badge ok">Consented</span> : <span className="badge">No consent recorded</span>}</dd>
          <dt className="muted">First response</dt><dd style={{ margin: 0 }}>{lead.first_response_at ? dateTime(lead.first_response_at) : <span className="badge danger">Not yet</span>}</dd>
          <dt className="muted">Created</dt><dd style={{ margin: 0 }}>{dateTime(lead.created_at)} <span className="small muted">({relative(lead.created_at)})</span></dd>
        </dl>
      ) : (
        <div className="stack">
          <div className="grid grid-form">
            <Field label="Name"><input value={f.name} onChange={set("name")} /></Field>
            <Field label="Phone"><input value={f.phone} onChange={set("phone")} /></Field>
            <Field label="Email"><input value={f.email} onChange={set("email")} /></Field>
            <Field label="Source"><select value={f.source} onChange={set("source")}><option value="">—</option>{meta.enums.lead_sources?.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Purpose"><select value={f.purpose} onChange={set("purpose")}><option value="buy">Buy</option><option value="rent">Rent</option></select></Field>
            <Field label="Property type"><select value={f.property_type} onChange={set("property_type")}><option value="">Any</option>{meta.enums.categories?.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select></Field>
            <Field label="Preferred area"><input value={f.preferred_area} onChange={set("preferred_area")} /></Field>
            <Field label="Budget min"><input type="number" value={f.budget_min} onChange={set("budget_min")} /></Field>
            <Field label="Budget max"><input type="number" value={f.budget_max} onChange={set("budget_max")} /></Field>
            <Field label="Bedrooms"><input type="number" value={f.bedrooms} onChange={set("bedrooms")} /></Field>
            <Field label="Timeline"><select value={f.timeline} onChange={set("timeline")}><option value="">Unknown</option>{meta.enums.timelines?.map((t) => <option key={t} value={t}>{label(t).replace(/_/g, " ")}</option>)}</select></Field>
            <Field label="Language"><input value={f.language} onChange={set("language")} /></Field>
          </div>
          <div className="row">
            <label className="check"><input type="checkbox" checked={f.marketing_consent} onChange={(e) => setF({ ...f, marketing_consent: e.target.checked })} /> Marketing consent</label>
            <label className="check"><input type="checkbox" checked={f.opted_out} onChange={(e) => setF({ ...f, opted_out: e.target.checked })} /> Opted out of messages</label>
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn primary" onClick={save}>Save details</button>
          </div>
        </div>
      )}
    </section>
  );
}

function StatusForm({ lead, meta, disabled, onSave }: { lead: any; meta: Meta; disabled: boolean; onSave: (b: any) => void }) {
  const [status, setStatus] = React.useState(lead.status);
  const [reason, setReason] = React.useState(lead.lost_reason ?? meta.settings.lost_reasons[0]);
  React.useEffect(() => setStatus(lead.status), [lead.status]);
  return (
    <div className="row" style={{ alignItems: "end" }}>
      <Field label="Stage">
        <select value={status} disabled={disabled} onChange={(e) => setStatus(e.target.value)}>
          {meta.settings.lead_stages.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      </Field>
      {status === "lost" && (
        <Field label="Lost reason">
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {meta.settings.lost_reasons.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
      )}
      <button className="btn" disabled={disabled || status === lead.status} onClick={() => onSave({ status, lost_reason: reason })}>Update stage</button>
    </div>
  );
}

function LogForm({ onSave }: { onSave: (b: any) => void }) {
  const [kind, setKind] = React.useState("call");
  const [body, setBody] = React.useState("");
  const [outcome, setOutcome] = React.useState("");
  const [minutes, setMinutes] = React.useState("");
  return (
    <form className="stack" onSubmit={(e) => {
      e.preventDefault();
      if (!body.trim()) return;
      onSave({ kind, body, outcome: outcome || null, duration_min: minutes ? Number(minutes) : null });
      setBody(""); setOutcome(""); setMinutes("");
    }}>
      <div className="grid grid-form">
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {["call", "whatsapp", "email", "sms", "meeting", "note"].map((k) => <option key={k} value={k}>{label(k)}</option>)}
          </select>
        </Field>
        <Field label="Outcome">
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">—</option><option value="reached">Reached</option><option value="no_answer">No answer</option>
            <option value="callback_requested">Callback requested</option><option value="interested">Interested</option>
          </select>
        </Field>
        <Field label="Minutes"><input type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
      </div>
      <Field label="Notes"><textarea required value={body} onChange={(e) => setBody(e.target.value)} placeholder="What was discussed and what happens next?" /></Field>
      <div className="form-actions"><button className="btn primary" type="submit">Log activity</button></div>
    </form>
  );
}

function ViewingQuick({ leadId, propertyId, onDone, agents }: { leadId: number; propertyId: number; onDone: () => void; agents: any[] }) {
  const [open, setOpen] = React.useState(false);
  const [when, setWhen] = React.useState("");
  const [agent, setAgent] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  if (!open) return <button className="btn sm" style={{ marginTop: 6 }} onClick={() => setOpen(true)}>Schedule viewing</button>;
  return (
    <div className="stack" style={{ marginTop: 8 }}>
      {err && <Alert>{err}</Alert>}
      <div className="grid grid-form">
        <Field label="When"><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <Field label="Agent"><select value={agent} onChange={(e) => setAgent(e.target.value)}><option value="">Me</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      </div>
      <div className="row">
        <button className="btn sm primary" disabled={!when} onClick={async () => {
          try {
            await api("/viewings", { method: "POST", json: { lead_id: leadId, property_id: propertyId, scheduled_at: toIso(when), agent_id: agent ? Number(agent) : undefined } });
            setOpen(false); onDone();
          } catch (e) {
            setErr(e instanceof HttpError && e.status === 409 ? "That agent already has a viewing at this time. Pick another time or agent." : (e as Error).message);
          }
        }}>Book</button>
        <button className="btn sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function OpenDealForm({ leadId, properties, onDone }: { leadId: number; properties: any[]; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [propertyId, setPropertyId] = React.useState("");
  const [offer, setOffer] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  if (!open) return <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>Open a deal</button>;
  return (
    <div className="stack" style={{ marginTop: 10 }}>
      {err && <Alert>{err}</Alert>}
      <div className="grid grid-form">
        <Field label="Listing">
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            <option value="">Select an active listing…</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.ref} · {p.title}</option>)}
          </select>
        </Field>
        <Field label="Offer amount (AED)"><input type="number" value={offer} onChange={(e) => setOffer(e.target.value)} /></Field>
      </div>
      <div className="row">
        <button className="btn sm primary" disabled={!propertyId} onClick={async () => {
          try {
            await api("/deals", { method: "POST", json: { lead_id: leadId, property_id: Number(propertyId), offer_amount: offer ? Number(offer) : undefined } });
            setOpen(false); onDone();
          } catch (e) { setErr((e as Error).message); }
        }}>Create deal</button>
        <button className="btn sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function TaskForm({ leadId, agents, onDone }: { leadId: number; agents: any[]; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [due, setDue] = React.useState("");
  const [assignee, setAssignee] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  if (!open) return <button className="btn sm" style={{ marginTop: 10 }} onClick={() => setOpen(true)}>+ Add task</button>;
  return (
    <div className="stack" style={{ marginTop: 10 }}>
      {err && <Alert>{err}</Alert>}
      <div className="grid grid-form">
        <Field label="Task"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Send shortlist" /></Field>
        <Field label="Due"><input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <Field label="Assign to"><select value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Me</option>{agents.filter((a: any) => a.role === "agent" || a.role === "team_leader").map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      </div>
      <div className="row">
        <button className="btn sm primary" disabled={!title} onClick={async () => {
          try {
            await api("/tasks", { method: "POST", json: { title, lead_id: leadId, due_at: due ? toIso(due) : null, assigned_to: assignee ? Number(assignee) : undefined } });
            setTitle(""); setDue(""); setOpen(false); onDone();
          } catch (e) { setErr((e as Error).message); }
        }}>Save task</button>
        <button className="btn sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}


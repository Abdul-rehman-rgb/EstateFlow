"use client";
import React from "react";
import Link from "next/link";
import { api, HttpError, dateTime, label, toIso, toLocalInput } from "@/lib/client";
import { Alert, Badge, Empty, Field, PageHead, Spinner, useNotice } from "@/components/ui";
import { getMeta, type Meta } from "@/components/meta";

export default function ViewingsPage() {
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [rows, setRows] = React.useState<any[] | null>(null);
  const [scope, setScope] = React.useState<"upcoming" | "past" | "all">("upcoming");
  const [showNew, setShowNew] = React.useState(false);
  const [leads, setLeads] = React.useState<any[]>([]);
  const [props, setProps] = React.useState<any[]>([]);
  const [editing, setEditing] = React.useState<any | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<any[] | null>(null);
  const { flash, node } = useNotice();
  const [form, setForm] = React.useState({ lead_id: "", property_id: "", agent_id: "", scheduled_at: "", duration_min: "30", mode: "in_person", location: "", meeting_link: "" });

  React.useEffect(() => {
    getMeta().then(setMeta).catch(() => undefined);
    if (new URLSearchParams(window.location.search).get("new")) setShowNew(true);
    api<{ leads: any[] }>("/leads").then((r) => setLeads(r.leads)).catch(() => undefined);
    api<{ properties: any[] }>("/properties?status=active").then((r) => setProps(r.properties)).catch(() => undefined);
  }, []);

  const load = React.useCallback(() => {
    const now = new Date();
    const from = scope === "upcoming" ? new Date(now.getTime() - 3 * 3600e3) : null;
    const qs = new URLSearchParams();
    if (from) qs.set("from", from.toISOString());
    if (scope === "past") qs.set("to", now.toISOString());
    api<{ viewings: any[] }>(`/viewings?${qs}`).then((r) => setRows(r.viewings)).catch((e) => setError(e.message));
  }, [scope]);
  React.useEffect(() => { load(); }, [load]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, any[]>();
    for (const v of rows ?? []) {
      const day = new Date(v.scheduled_at).toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "long" });
      map.set(day, [...(map.get(day) ?? []), v]);
    }
    return [...map.entries()];
  }, [rows]);

  const book = async (force = false) => {
    setError(null); setConflict(null);
    try {
      const res = await api<any>("/viewings", { method: "POST", json: {
        lead_id: Number(form.lead_id), property_id: Number(form.property_id), agent_id: form.agent_id ? Number(form.agent_id) : undefined,
        scheduled_at: toIso(form.scheduled_at), duration_min: Number(form.duration_min), mode: form.mode, location: form.location || null,
        meeting_link: form.meeting_link || null, allow_conflict: force,
      } });
      setShowNew(false);
      flash(res.conflicts?.length ? "Viewing booked (overlaps noted)." : "Viewing booked.");
      load();
    } catch (e) {
      if (e instanceof HttpError && e.status === 409 && e.details?.conflicts) setConflict(e.details.conflicts);
      else setError((e as Error).message);
    }
  };

  return (
    <>
      <PageHead title="Viewings" subtitle="Schedule in-person or virtual viewings, then record what happened.">
        <div className="row">
          {(["upcoming", "past", "all"] as const).map((s) => (
            <button key={s} className={`btn sm ${scope === s ? "primary" : ""}`} onClick={() => setScope(s)}>{label(s)}</button>
          ))}
          {meta?.can.viewings && <button className="btn primary" onClick={() => setShowNew((x) => !x)}>{showNew ? "Close" : "+ Schedule viewing"}</button>}
        </div>
      </PageHead>
      {node}
      {error && <Alert>{error}</Alert>}

      {showNew && (
        <section className="card stack" style={{ marginBottom: 16 }} aria-labelledby="nv-h">
          <h2 id="nv-h">Schedule a viewing</h2>
          {conflict && (
            <Alert kind="warn">
              The agent already has {conflict.length === 1 ? "a viewing" : "viewings"} overlapping this time:
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{conflict.map((c: any) => <li key={c.id}>{dateTime(c.scheduled_at)} · {c.lead_name} · {c.property_ref}</li>)}</ul>
              <div className="row" style={{ marginTop: 8 }}><button className="btn sm" onClick={() => book(true)}>Book anyway</button></div>
            </Alert>
          )}
          <div className="grid grid-form">
            <Field label="Lead"><select value={form.lead_id} onChange={(e) => setForm({ ...form, lead_id: e.target.value })}><option value="">Select…</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
            <Field label="Listing"><select value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })}><option value="">Select…</option>{props.map((p) => <option key={p.id} value={p.id}>{p.ref} · {p.title}</option>)}</select></Field>
            <Field label="Agent"><select value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: e.target.value })}><option value="">Me</option>{meta?.users.filter((u) => u.role === "agent").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
            <Field label="Date & time"><input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></Field>
            <Field label="Duration (min)"><input type="number" min={15} step={15} value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: e.target.value })} /></Field>
            <Field label="Mode"><select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}><option value="in_person">In person</option><option value="virtual">Virtual</option></select></Field>
            <Field label={form.mode === "virtual" ? "Meeting link" : "Meeting location"}>
              <input value={form.mode === "virtual" ? form.meeting_link : form.location} onChange={(e) => setForm(form.mode === "virtual" ? { ...form, meeting_link: e.target.value } : { ...form, location: e.target.value })} />
            </Field>
          </div>
          <div className="form-actions"><button className="btn" onClick={() => setShowNew(false)}>Cancel</button><button className="btn primary" disabled={!form.lead_id || !form.property_id || !form.scheduled_at} onClick={() => book(false)}>Book viewing</button></div>
        </section>
      )}

      {!rows ? <Spinner /> : rows.length === 0 ? <div className="card"><Empty>No viewings in this view.</Empty></div> : grouped.map(([day, items]) => (
        <section key={day} style={{ marginBottom: 18 }} aria-label={day}>
          <h3>{day}</h3>
          <div className="card flush">
            <div className="table-wrap"><table>
              <thead><tr><th>Time</th><th>Lead</th><th>Property</th><th>Agent</th><th>Status</th><th>Outcome</th><th /></tr></thead>
              <tbody>
                {items.map((v) => (
                  <tr key={v.id}>
                    <td className="num">{new Date(v.scheduled_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}<div className="small muted">{v.duration_min} min · {label(v.mode)}</div></td>
                    <td><Link href={`/leads/${v.lead_id}`}>{v.lead_name}</Link><div className="small muted">{v.lead_phone}</div></td>
                    <td>{v.property_ref}<div className="small muted">{v.property_title}</div></td>
                    <td>{v.agent_name ?? "—"}</td>
                    <td><Badge value={v.status} /></td>
                    <td>{v.outcome ? <Badge value={v.outcome} tone={v.outcome === "interested" ? "ok" : v.outcome === "not_interested" ? "danger" : "warn"} /> : "—"}</td>
                    <td className="right">
                      {meta?.can.viewings && v.status === "scheduled" && <button className="btn sm" onClick={() => setEditing(v)}>Record outcome</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </section>
      ))}

      {editing && <OutcomeDialog viewing={editing} onClose={() => setEditing(null)} onSaved={(m) => { setEditing(null); flash(m); load(); }} />}
    </>
  );
}

function OutcomeDialog({ viewing, onClose, onSaved }: { viewing: any; onClose: () => void; onSaved: (msg: string) => void }) {
  const [status, setStatus] = React.useState("completed");
  const [outcome, setOutcome] = React.useState("interested");
  const [feedback, setFeedback] = React.useState("");
  const [objections, setObjections] = React.useState("");
  const [nextSteps, setNextSteps] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api(`/viewings/${viewing.id}`, { method: "PATCH", json: { status, outcome: status === "completed" ? outcome : null, feedback, objections, next_steps: nextSteps } });
      onSaved(status === "completed" ? "Outcome saved. A follow-up task was created for the agent." : "Viewing updated.");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  const reschedule = async () => {
    const when = prompt("New date and time (YYYY-MM-DD HH:MM)", toLocalInput(viewing.scheduled_at).replace("T", " "));
    if (!when) return;
    try {
      await api(`/viewings/${viewing.id}/reschedule`, { method: "POST", json: { scheduled_at: new Date(when.replace(" ", "T")).toISOString() } });
      onSaved("Viewing rescheduled.");
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="out-h" onClick={onClose}>
      <div className="card dialog stack" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h2 id="out-h" style={{ margin: 0 }}>{viewing.lead_name} · {viewing.property_ref}</h2><button className="btn sm ghost" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="muted">{dateTime(viewing.scheduled_at)}</div>
        {err && <Alert>{err}</Alert>}
        <div className="grid grid-form">
          <Field label="Visit status"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="completed">Completed</option><option value="no_show">No-show</option><option value="cancelled">Cancelled</option></select></Field>
          {status === "completed" && <Field label="Client outcome"><select value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="interested">Interested</option><option value="follow_up_required">Follow-up required</option><option value="not_interested">Not interested</option></select></Field>}
        </div>
        {status === "completed" && <>
          <Field label="Feedback"><textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} /></Field>
          <Field label="Objections"><textarea value={objections} onChange={(e) => setObjections(e.target.value)} placeholder="Price, layout, service charges…" /></Field>
          <Field label="Next steps"><textarea value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} /></Field>
        </>}
        <div className="form-actions">
          <button className="btn" onClick={reschedule}>Reschedule</button>
          <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

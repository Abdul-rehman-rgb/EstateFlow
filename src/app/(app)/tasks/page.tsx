"use client";
import React from "react";
import Link from "next/link";
import { api, dateTime, label, relative, toIso } from "@/lib/client";
import { Alert, Badge, Empty, Field, PageHead, Spinner, useNotice } from "@/components/ui";
import { getMeta, type Meta } from "@/components/meta";

export default function TasksPage() {
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [tasks, setTasks] = React.useState<any[] | null>(null);
  const [scope, setScope] = React.useState<"mine" | "all">("mine");
  const [status, setStatus] = React.useState<"open" | "overdue" | "done">("open");
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ title: "", due_at: "", assigned_to: "", priority: "normal", lead_id: "" });
  const [leads, setLeads] = React.useState<any[]>([]);
  const { flash, node } = useNotice();

  React.useEffect(() => {
    getMeta().then(setMeta).catch(() => undefined);
    api<{ leads: any[] }>("/leads").then((r) => setLeads(r.leads)).catch(() => undefined);
  }, []);
  const load = React.useCallback(() => {
    api<{ tasks: any[] }>(`/tasks?scope=${scope}&status=${status}`).then((r) => setTasks(r.tasks)).catch((e) => setError(e.message));
  }, [scope, status]);
  React.useEffect(() => { load(); }, [load]);

  const update = async (id: number, body: any, ok: string) => {
    try { await api(`/tasks/${id}`, { method: "PATCH", json: body }); flash(ok); load(); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <PageHead title="Follow-up tasks" subtitle="Next actions, due dates and escalations.">
        {meta?.can.escalate && <button className="btn" onClick={async () => {
          const r = await api<{ escalated: number }>("/tasks/escalate", { method: "POST" });
          flash(`${r.escalated} overdue task(s) escalated to a team leader or manager.`); load();
        }}>Escalate overdue (24 h+)</button>}
      </PageHead>
      {node}
      {error && <Alert>{error}</Alert>}

      <div className="toolbar">
        <label className="field">Show<select value={scope} onChange={(e) => setScope(e.target.value as any)}><option value="mine">My tasks</option><option value="all">Team & branch</option></select></label>
        <label className="field">Status<select value={status} onChange={(e) => setStatus(e.target.value as any)}><option value="open">Open</option><option value="overdue">Overdue</option><option value="done">Done</option></select></label>
      </div>

      {meta?.can.tasks && (
        <form className="card stack" style={{ marginBottom: 16 }} onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/tasks", { method: "POST", json: { title: form.title, due_at: form.due_at ? toIso(form.due_at) : null, assigned_to: form.assigned_to ? Number(form.assigned_to) : undefined, priority: form.priority, lead_id: form.lead_id ? Number(form.lead_id) : null } });
            setForm({ title: "", due_at: "", assigned_to: "", priority: "normal", lead_id: "" });
            flash("Task added."); load();
          } catch (er) { setError((er as Error).message); }
        }}>
          <h2 style={{ margin: 0 }}>New task</h2>
          <div className="grid grid-form">
            <Field label="Task *"><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Due"><input type="datetime-local" value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></Field>
            <Field label="Lead"><select value={form.lead_id} onChange={(e) => setForm({ ...form, lead_id: e.target.value })}><option value="">None</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
            <Field label="Assign to"><select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}><option value="">Me</option>{meta.users.filter((u) => u.id !== meta.me.id && u.branch_id === meta.me.branch_id || u.id === meta.me.id || meta.can.admin).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
            <Field label="Priority"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{meta.enums.priorities?.map((p) => <option key={p}>{p}</option>)}</select></Field>
          </div>
          <div className="form-actions"><button className="btn primary" disabled={!form.title}>Add task</button></div>
        </form>
      )}

      <div className="card flush">
        {!tasks ? <div style={{ padding: 16 }}><Spinner /></div> : tasks.length === 0 ? <Empty>Nothing here. Enjoy the quiet.</Empty> : (
          <ul className="list" style={{ padding: "0 16px" }}>
            {tasks.map((t) => {
              const overdue = t.status === "open" && t.due_at && new Date(t.due_at) < new Date();
              return (
                <li key={t.id} className="row between" style={{ padding: "12px 0" }}>
                  <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                    <div className="row" style={{ gap: 6 }}>
                      <span style={{ fontWeight: 600, textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.title}</span>
                      {t.priority !== "normal" && <Badge value={t.priority} tone={t.priority === "urgent" ? "danger" : "warn"} />}
                      {t.escalated_to && <span className="badge danger">Escalated</span>}
                    </div>
                    <div className="small muted">
                      {t.assignee_name} · {t.due_at ? <span style={overdue ? { color: "var(--danger)", fontWeight: 600 } : undefined}>{overdue ? "Overdue " : "Due "}{relative(t.due_at)}</span> : "No due date"}
                      {t.lead_id && <> · <Link href={`/leads/${t.lead_id}`}>{t.lead_name}</Link></>}
                      {t.property_ref && <> · {t.property_ref}</>}
                    </div>
                  </div>
                  {t.status === "open" ? (
                    <div className="row">
                      <input type="datetime-local" aria-label="Reschedule" style={{ width: "auto" }} defaultValue=""
                        onChange={(e) => e.target.value && update(t.id, { due_at: toIso(e.target.value) }, "Due date updated.")} />
                      <button className="btn sm primary" onClick={() => update(t.id, { status: "done" }, "Task completed.")}>Complete</button>
                    </div>
                  ) : <span className="small muted">Done {dateTime(t.completed_at)}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

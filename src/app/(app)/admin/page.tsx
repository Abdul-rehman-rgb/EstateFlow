"use client";
import React from "react";
import { api, label } from "@/lib/client";
import { Alert, Badge, Field, PageHead, Spinner, useNotice } from "@/components/ui";
import { getMeta, refreshMeta, type Meta } from "@/components/meta";

const ROLE_OPTIONS = ["super_admin", "owner", "branch_manager", "team_leader", "agent", "finance"];

export default function AdminPage() {
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [tab, setTab] = React.useState<"users" | "structure" | "settings">("users");
  const [error, setError] = React.useState<string | null>(null);
  const { flash, node } = useNotice();
  React.useEffect(() => { getMeta().then(setMeta).catch(() => undefined); }, []);

  if (meta && !meta.can.admin) return <Alert>Only super admins can manage users and settings.</Alert>;
  if (!meta) return <Spinner />;
  return (
    <>
      <PageHead title="Administration" subtitle="Users, branches, teams and business rules." />
      {node}
      {error && <Alert>{error}</Alert>}
      <div className="tabs" role="tablist">
        {(["users", "structure", "settings"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{label(t)}</button>
        ))}
      </div>
      {tab === "users" && <UsersTab meta={meta} onError={setError} onOk={(m) => { flash(m); refreshMeta().then(setMeta); }} />}
      {tab === "structure" && <StructureTab meta={meta} onError={setError} onOk={(m) => { flash(m); refreshMeta().then(setMeta); }} />}
      {tab === "settings" && <SettingsTab meta={meta} onError={setError} onOk={(m) => { flash(m); refreshMeta().then(setMeta); }} />}
    </>
  );
}

type Tab = { onError: (m: string | null) => void; onOk: (m: string) => void; meta: Meta };

function UsersTab({ meta, onError, onOk }: Tab) {
  const [users, setUsers] = React.useState<any[] | null>(null);
  const [form, setForm] = React.useState({ name: "", email: "", role: "agent", branch_id: "", team_id: "", password: "" });
  const load = React.useCallback(() => api<{ users: any[] }>("/admin/users").then((r) => setUsers(r.users)).catch((e) => onError(e.message)), [onError]);
  React.useEffect(() => { load(); }, [load]);
  const patch = async (id: number, body: any, ok: string) => {
    try { await api(`/admin/users/${id}`, { method: "PATCH", json: body }); onOk(ok); load(); }
    catch (e) { onError((e as Error).message); }
  };
  return (
    <>
      <form className="card stack" style={{ marginBottom: 16 }} onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api("/admin/users", { method: "POST", json: { ...form, branch_id: form.branch_id ? Number(form.branch_id) : null, team_id: form.team_id ? Number(form.team_id) : null } });
          setForm({ name: "", email: "", role: "agent", branch_id: "", team_id: "", password: "" });
          onOk("User created. Share the temporary password securely; they can change it under My account.");
          load();
        } catch (er) { onError((er as Error).message); }
      }}>
        <h2 style={{ margin: 0 }}>Add user</h2>
        <div className="grid grid-form">
          <Field label="Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Role"><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLE_OPTIONS.map((r) => <option key={r} value={r}>{label(r).replace("Super admin", "Super Admin")}</option>)}</select></Field>
          <Field label="Branch"><select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}><option value="">None</option>{meta.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Team"><select value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })}><option value="">None</option>{meta.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Temporary password" hint="At least 8 characters"><input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        </div>
        <div className="form-actions"><button className="btn primary">Create user</button></div>
      </form>
      <div className="card flush">
        {!users ? <div style={{ padding: 16 }}><Spinner /></div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branch / team</th><th>Status</th><th /></tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.name}</td>
                <td className="small">{u.email}</td>
                <td>
                  <select aria-label={`Role for ${u.name}`} value={u.role} onChange={(e) => patch(u.id, { role: e.target.value }, "Role updated.")} style={{ width: "auto" }}>
                    {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{label(r)}</option>)}
                  </select>
                </td>
                <td className="small">
                  <select aria-label={`Branch for ${u.name}`} value={u.branch_id ?? ""} onChange={(e) => patch(u.id, { branch_id: e.target.value ? Number(e.target.value) : null }, "Branch updated.")} style={{ width: "auto", marginBottom: 4 }}>
                    <option value="">No branch</option>{meta.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <select aria-label={`Team for ${u.name}`} value={u.team_id ?? ""} onChange={(e) => patch(u.id, { team_id: e.target.value ? Number(e.target.value) : null }, "Team updated.")} style={{ width: "auto" }}>
                    <option value="">No team</option>{meta.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </td>
                <td><Badge value={u.active ? "active" : "archived"} tone={u.active ? "ok" : "danger"} /> {u.active ? null : null}</td>
                <td className="right">
                  <button className="btn sm" onClick={() => patch(u.id, { active: !u.active }, u.active ? "User deactivated." : "User reactivated.")}>{u.active ? "Deactivate" : "Reactivate"}</button>
                  <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => { const pw = prompt(`New temporary password for ${u.name} (min 8 characters)`); if (pw) patch(u.id, { password: pw }, "Password reset."); }}>Reset password</button>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}

function StructureTab({ meta, onError, onOk }: Tab) {
  const [branch, setBranch] = React.useState({ name: "", emirate: "Dubai" });
  const [team, setTeam] = React.useState({ name: "", branch_id: "", leader_id: "" });
  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <section className="card stack">
        <h2 style={{ margin: 0 }}>Branches</h2>
        <ul className="list">{meta.branches.map((b) => <li key={b.id}><strong>{b.name}</strong> <span className="small muted">{b.emirate}</span></li>)}</ul>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          try { await api("/admin/branches", { method: "POST", json: branch }); setBranch({ name: "", emirate: "Dubai" }); onOk("Branch added."); }
          catch (er) { onError((er as Error).message); }
        }}>
          <div className="grid grid-form">
            <Field label="Branch name"><input required value={branch.name} onChange={(e) => setBranch({ ...branch, name: e.target.value })} /></Field>
            <Field label="Emirate"><input value={branch.emirate} onChange={(e) => setBranch({ ...branch, emirate: e.target.value })} /></Field>
          </div>
          <div className="form-actions"><button className="btn">Add branch</button></div>
        </form>
      </section>
      <section className="card stack">
        <h2 style={{ margin: 0 }}>Teams</h2>
        <ul className="list">{meta.teams.map((t) => <li key={t.id}><strong>{t.name}</strong> <span className="small muted">{meta.branches.find((b) => b.id === t.branch_id)?.name} · Leader: {meta.users.find((u) => u.id === t.leader_id)?.name ?? "none"}</span></li>)}</ul>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api("/admin/teams", { method: "POST", json: { name: team.name, branch_id: Number(team.branch_id), leader_id: team.leader_id ? Number(team.leader_id) : null } });
            setTeam({ name: "", branch_id: "", leader_id: "" }); onOk("Team added. Assign members from the Users tab.");
          } catch (er) { onError((er as Error).message); }
        }}>
          <div className="grid grid-form">
            <Field label="Team name"><input required value={team.name} onChange={(e) => setTeam({ ...team, name: e.target.value })} /></Field>
            <Field label="Branch"><select required value={team.branch_id} onChange={(e) => setTeam({ ...team, branch_id: e.target.value })}><option value="">Select…</option>{meta.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            <Field label="Leader (optional)"><select value={team.leader_id} onChange={(e) => setTeam({ ...team, leader_id: e.target.value })}><option value="">None</option>{meta.users.filter((u) => u.role === "team_leader").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          </div>
          <div className="form-actions"><button className="btn">Add team</button></div>
        </form>
      </section>
    </div>
  );
}

function SettingsTab({ meta, onError, onOk }: Tab) {
  const s = meta.settings;
  const [mode, setMode] = React.useState(s.assignment_mode);
  const [sla, setSla] = React.useState(String(s.sla_first_response_hours));
  const [validity, setValidity] = React.useState(String(s.listing_validity_days));
  const [stages, setStages] = React.useState(s.lead_stages.join("\n"));
  const [reasons, setReasons] = React.useState(s.lost_reasons.join("\n"));
  const save = async () => {
    try {
      await api("/admin/settings", { method: "PATCH", json: {
        assignment_mode: mode, sla_first_response_hours: Number(sla), listing_validity_days: Number(validity),
        lead_stages: stages.split("\n").map((x) => x.trim()).filter(Boolean),
        lost_reasons: reasons.split("\n").map((x) => x.trim()).filter(Boolean),
      } });
      onOk("Settings saved.");
    } catch (e) { onError((e as Error).message); }
  };
  return (
    <section className="card stack" style={{ maxWidth: 720 }}>
      <h2 style={{ margin: 0 }}>Business rules</h2>
      <div className="grid grid-form">
        <Field label="New lead assignment" hint="Round-robin rotates agents in the branch. Workload gives leads to the agent with the fewest open leads.">
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="manual">Manual only</option><option value="round_robin">Round-robin</option><option value="workload">Lowest workload</option>
          </select>
        </Field>
        <Field label="First-response SLA (hours)"><input type="number" min={1} value={sla} onChange={(e) => setSla(e.target.value)} /></Field>
        <Field label="Listing validity (days)"><input type="number" min={1} value={validity} onChange={(e) => setValidity(e.target.value)} /></Field>
      </div>
      <Field label="Lead stages (one per line)" hint='Must include "new", "won" and "lost".'><textarea rows={6} value={stages} onChange={(e) => setStages(e.target.value)} /></Field>
      <Field label="Lost reasons (one per line)"><textarea rows={5} value={reasons} onChange={(e) => setReasons(e.target.value)} /></Field>
      <div className="form-actions"><button className="btn primary" onClick={save}>Save settings</button></div>
    </section>
  );
}

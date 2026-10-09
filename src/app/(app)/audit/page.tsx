"use client";
import React from "react";
import { api, dateTime, label } from "@/lib/client";
import { Alert, Empty, PageHead, Spinner } from "@/components/ui";

type Entry = { id: number; created_at: string; user_name: string | null; action: string; entity: string; entity_id: number | null; details: any };

export default function AuditPage() {
  const [rows, setRows] = React.useState<Entry[] | null>(null);
  const [entity, setEntity] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    api<{ entries: Entry[] }>(`/audit?limit=300${entity ? `&entity=${entity}` : ""}`).then((r) => setRows(r.entries)).catch((e) => setError(e.message));
  }, [entity]);
  return (
    <>
      <PageHead title="Audit log" subtitle="Who changed what, and when. Covers records, permissions, exports, deletions and sign-ins." />
      {error && <Alert>{error}</Alert>}
      <div className="toolbar">
        <label className="field">Record type
          <select value={entity} onChange={(e) => { setRows(null); setEntity(e.target.value); }}>
            <option value="">All</option>{["lead", "property", "deal", "viewing", "task", "document", "user", "branch", "team", "settings", "import"].map((x) => <option key={x} value={x}>{label(x)}</option>)}
          </select>
        </label>
      </div>
      <div className="card flush">
        {!rows ? <div style={{ padding: 16 }}><Spinner /></div> : rows.length === 0 ? <Empty>No entries.</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td className="small">{dateTime(r.created_at)}</td>
                <td>{r.user_name ?? "System"}</td>
                <td><span className="badge">{label(r.action)}</span></td>
                <td>{label(r.entity)}{r.entity_id ? ` #${r.entity_id}` : ""}</td>
                <td className="small muted" style={{ maxWidth: 380, wordBreak: "break-word" }}>{r.details ? JSON.stringify(r.details) : "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}

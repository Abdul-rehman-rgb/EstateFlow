"use client";
import React from "react";
import { api, label } from "@/lib/client";
import { Alert, Empty, PageHead, Spinner } from "@/components/ui";
import { getMeta, type Meta } from "@/components/meta";

const REPORTS = [
  { key: "funnel", label: "Lead funnel", desc: "Leads received through to won.", roles: "all" },
  { key: "sla", label: "Response SLA", desc: "Time to first response, untouched and unassigned leads.", roles: "all" },
  { key: "sources", label: "Source ROI", desc: "Volume, qualification and won value by source.", roles: "all" },
  { key: "agents", label: "Agent leaderboard", desc: "Open leads, viewings, closed value and commission.", roles: "all" },
  { key: "inventory", label: "Inventory", desc: "Listings by status and value.", roles: "all" },
  { key: "pipeline", label: "Pipeline forecast", desc: "Open deals and expected commission by close month.", roles: "all" },
  { key: "viewings", label: "Viewing outcomes", desc: "Completed, no-show and outcomes.", roles: "all" },
  { key: "commissions", label: "Commissions", desc: "Commission status for signed deals.", roles: "all" },
];

export default function ReportsPage() {
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [active, setActive] = React.useState("funnel");
  const [data, setData] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { getMeta().then(setMeta).catch(() => undefined); }, []);
  React.useEffect(() => {
    setData(null); setError(null);
    api(`/reports/${active}`).then(setData).catch((e) => setError(e.message));
  }, [active]);

  const list = REPORTS.filter((r) => meta?.me.role !== "finance" || ["pipeline", "commissions"].includes(r.key));

  return (
    <>
      <PageHead title="Reports" subtitle="Scoped to what you can see. Export any report as CSV.">
        {meta?.can.export && (
          <a className="btn" href={`/api/reports/${active}?format=csv`}>Export CSV</a>
        )}
      </PageHead>
      <div className="grid" style={{ gridTemplateColumns: "minmax(200px, 260px) 1fr", alignItems: "start" }}>
        <nav className="card stack" aria-label="Reports" style={{ padding: 8 }}>
          {list.map((r) => (
            <button key={r.key} className={`btn ${active === r.key ? "primary" : "ghost"}`} style={{ justifyContent: "flex-start", width: "100%", textAlign: "left" }}
              aria-current={active === r.key ? "page" : undefined} onClick={() => setActive(r.key)}>
              {r.label}
            </button>
          ))}
        </nav>
        <section className="card" aria-live="polite">
          {error && <Alert>{error}</Alert>}
          {!data && !error && <Spinner />}
          {data && (
            <>
              <h2>{data.title}</h2>
              <p className="small muted">{REPORTS.find((r) => r.key === active)?.desc}</p>
              {data.rows.length === 0 ? <Empty>No data for this report yet.</Empty> : (
                <div className="table-wrap"><table>
                  <thead><tr>{data.columns.map((c: string) => <th key={c} className={typeof data.rows[0][c] === "number" ? "right" : ""}>{label(c)}</th>)}</tr></thead>
                  <tbody>{data.rows.map((row: any, i: number) => (
                    <tr key={i}>{data.columns.map((c: string) => (
                      <td key={c} className={typeof row[c] === "number" ? "right num" : ""}>
                        {typeof row[c] === "number" && /value|commission|amount|total/.test(c) ? Math.round(row[c]).toLocaleString() : row[c] ?? "—"}
                      </td>
                    ))}</tr>
                  ))}</tbody>
                </table></div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}

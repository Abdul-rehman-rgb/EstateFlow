"use client";
import React from "react";
import { api, label } from "@/lib/client";
import { Alert, Field, PageHead, useNotice } from "@/components/ui";
import { getMeta, type Meta } from "@/components/meta";

export default function ImportPage() {
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [entity, setEntity] = React.useState<"leads" | "properties">("leads");
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { flash, node } = useNotice();

  React.useEffect(() => { getMeta().then(setMeta).catch(() => undefined); }, []);

  const send = async (commit: boolean) => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await api<any>(`/imports/${entity}${commit ? "?commit=1" : ""}`, { method: "POST", body: fd });
      if (commit) {
        flash(`Imported ${res.created} record(s). ${res.skipped ? `${res.skipped} skipped as duplicates. ` : ""}${res.invalid ? `${res.invalid} row(s) had errors and were not imported.` : ""}`);
        setPreview(null); setFile(null);
      } else setPreview(res);
    } catch (e) { setError((e as Error).message); setPreview(null); }
    finally { setBusy(false); }
  };

  if (meta && !meta.can.import) return <Alert>Your role cannot import records.</Alert>;

  return (
    <>
      <PageHead title="Import from spreadsheet" subtitle="Upload a CSV. You review the results before anything is saved." />
      {node}
      {error && <Alert>{error}</Alert>}
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <section className="card stack" aria-labelledby="up-h">
          <h2 id="up-h">1. Choose and check the file</h2>
          <Field label="What are you importing?">
            <select value={entity} onChange={(e) => { setEntity(e.target.value as any); setPreview(null); }}>
              <option value="leads">Leads</option><option value="properties">Properties</option>
            </select>
          </Field>
          <Field label="CSV file" hint="Export from Excel or Google Sheets as CSV (UTF-8). Max 2,000 rows.">
            <input type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} />
          </Field>
          <div className="row">
            <a className="btn sm" href={`/api/imports/${entity}`}>Download template</a>
            <span className="small muted">Columns: {entity === "leads" ? "name, phone or email, source, purpose, budget_max…" : "title, category, listing_type, price, location…"}</span>
          </div>
          <div className="form-actions"><button className="btn primary" disabled={!file || busy} onClick={() => send(false)}>{busy ? "Checking…" : "Check file"}</button></div>
        </section>

        <section className="card stack" aria-labelledby="rv-h" aria-live="polite">
          <h2 id="rv-h">2. Review and import</h2>
          {!preview ? <p className="muted">Results appear here after the check. Nothing is saved yet.</p> : (
            <>
              <div className="grid grid-kpi">
                <div className="card kpi"><div className="label">Rows</div><div className="value">{preview.total}</div></div>
                <div className="card kpi"><div className="label">Ready</div><div className="value" style={{ color: "var(--ok)" }}>{preview.valid}</div></div>
                <div className="card kpi"><div className="label">Errors</div><div className="value" style={{ color: preview.invalid ? "var(--danger)" : undefined }}>{preview.invalid}</div></div>
                <div className="card kpi"><div className="label">Duplicates</div><div className="value">{preview.skipped}</div></div>
              </div>
              {preview.header_warnings?.map((w: string) => <div key={w} className="small muted">{w}</div>)}
              {preview.errors.length > 0 && (
                <div className="table-wrap"><table><thead><tr><th>Row</th><th>Problem</th></tr></thead><tbody>
                  {preview.errors.slice(0, 20).map((e: any) => <tr key={e.row}><td>{e.row}</td><td>{e.message}</td></tr>)}
                </tbody></table></div>
              )}
              {preview.skipped_rows?.length > 0 && <div className="small muted">Skipped: {preview.skipped_rows.slice(0, 5).map((s: any) => `row ${s.row} (${s.reason})`).join("; ")}</div>}
              {preview.preview?.length > 0 && <>
                <h3>Preview</h3>
                <pre className="preview">{JSON.stringify(preview.preview.slice(0, 3), null, 2)}</pre>
              </>}
              <div className="form-actions">
                <button className="btn" onClick={() => setPreview(null)}>Discard</button>
                <button className="btn primary" disabled={busy || !preview.valid} onClick={() => send(true)}>Import {preview.valid} {label(entity).toLowerCase()}</button>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

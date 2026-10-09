"use client";
import React from "react";
import { api } from "@/lib/client";
import { Alert, Field } from "./ui";

export function UploadForm({ params, onDone }: { params: Record<string, number>; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  return (
    <form className="stack" style={{ marginTop: 10 }} onSubmit={async (e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      for (const [k, v] of Object.entries(params)) form.set(k, String(v));
      setBusy(true); setErr(null);
      try {
        await api("/documents", { method: "POST", body: form });
        e.currentTarget.reset();
        onDone();
      } catch (er) { setErr((er as Error).message); }
      finally { setBusy(false); }
    }}>
      {err && <Alert>{err}</Alert>}
      <div className="grid grid-form">
        <Field label="File"><input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.csv,.txt,.mp4" /></Field>
        <Field label="Title (optional)"><input name="title" /></Field>
        <Field label="Kind"><select name="kind"><option value="document">Document</option><option value="identity">ID / Emirates ID</option><option value="contract">Contract</option><option value="photo">Photo</option><option value="floor_plan">Floor plan</option><option value="brochure">Brochure</option><option value="video">Video</option><option value="permit">Permit</option></select></Field>
        <Field label="Expires"><input type="date" name="expires_at" /></Field>
      </div>
      <div className="form-actions"><button className="btn sm primary" disabled={busy} type="submit">{busy ? "Uploading…" : "Upload"}</button></div>
    </form>
  );
}

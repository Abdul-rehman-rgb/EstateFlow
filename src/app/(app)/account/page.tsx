"use client";
import React from "react";
import { api } from "@/lib/client";
import { Alert, Field, PageHead, useNotice } from "@/components/ui";

export default function AccountPage() {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const { flash, node } = useNotice();
  return (
    <>
      <PageHead title="My account" subtitle="Change your password. Ask an administrator to change your role or branch." />
      {node}
      <form className="card stack" style={{ maxWidth: 420 }} onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (next !== again) return setError("The new passwords do not match.");
        setBusy(true);
        try {
          await api("/auth/password", { method: "POST", json: { current, next } });
          setCurrent(""); setNext(""); setAgain("");
          flash("Password changed.");
        } catch (er) { setError((er as Error).message); }
        finally { setBusy(false); }
      }}>
        <h2 style={{ margin: 0 }}>Change password</h2>
        {error && <Alert>{error}</Alert>}
        <Field label="Current password"><input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="New password" hint="At least 8 characters"><input type="password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Repeat new password"><input type="password" required value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" /></Field>
        <div className="form-actions"><button className="btn primary" disabled={busy}>{busy ? "Saving…" : "Update password"}</button></div>
      </form>
    </>
  );
}

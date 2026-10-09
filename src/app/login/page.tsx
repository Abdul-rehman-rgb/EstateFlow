"use client";
import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, HttpError } from "@/lib/client";
import { Alert, Field } from "@/components/ui";
import { Icon, Logo } from "@/components/icons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", json: { email, password } });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Could not sign in. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <aside className="auth-aside" aria-hidden>
        <div className="row" style={{ gap: 10, color: "#fff", fontWeight: 700, fontSize: 16 }}>
          <Logo size={34} /> EstateFlow
        </div>
        <div>
          <h2>Every lead, listing and deal — in one calm place.</h2>
          <p>The CRM built for UAE brokerages: fast lead response, clean listings, conflict-free viewings and commissions finance can trust.</p>
          <ul className="auth-points">
            <li><span><Icon name="bolt" size={16} /></span>Auto-assignment with first-response SLA tracking</li>
            <li><span><Icon name="calendar" size={16} /></span>Viewing scheduler that catches double bookings</li>
            <li><span><Icon name="money" size={16} /></span>Deal pipeline with commission approvals</li>
          </ul>
        </div>
        <div className="small" style={{ color: "#bfd3fe" }}>© {new Date().getFullYear()} EstateFlow · Dubai · Abu Dhabi</div>
      </aside>

      <main className="auth-main">
        <form className="auth-form stack" onSubmit={submit} aria-labelledby="login-title">
          <Link href="/" className="auth-back"><Icon name="arrow" size={16} /> Back to home</Link>
          <div>
            <h1 id="login-title">Welcome back</h1>
            <div className="muted">Sign in to your EstateFlow workspace.</div>
          </div>
          {error && <Alert>{error}</Alert>}
          <Field label="Email">
            <input type="email" autoComplete="username" placeholder="you@brokerage.ae" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <input type="password" autoComplete="current-password" placeholder="••••••••" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <button className="btn primary" type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Signing in…" : <>Sign in <Icon name="arrow" size={16} /></>}
          </button>
          <div className="small muted" style={{ textAlign: "center" }}>Accounts are created by your administrator.</div>
        </form>
      </main>
    </div>
  );
}

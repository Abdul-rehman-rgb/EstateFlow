"use client";
import React from "react";
import { STATUS_TONE, label } from "@/lib/client";
import { Icon, type IconName } from "./icons";

export function Badge({ value, tone }: { value?: string | null; tone?: string }) {
  const t = tone ?? STATUS_TONE[value ?? ""] ?? "";
  return <span className={`badge ${t}`}>{label(value)}</span>;
}

export function Alert({ kind = "danger", children }: { kind?: "danger" | "ok" | "warn"; children: React.ReactNode }) {
  return <div className={`alert ${kind === "danger" ? "" : kind}`} role={kind === "danger" ? "alert" : "status"}>{children}</div>;
}

export function Kpi({ label: l, value, tone, icon }: { label: string; value: React.ReactNode; tone?: "warn" | "danger"; icon?: IconName }) {
  return (
    <div className={`card kpi ${tone ?? ""}`}>
      <div className="kpi-top">
        <div className="label">{l}</div>
        {icon && <span className="kpi-icon"><Icon name={icon} size={17} /></span>}
      </div>
      <div className="value">{value}</div>
    </div>
  );
}

export function PageHead({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <div className="muted">{subtitle}</div>}
      </div>
      <div className="row">{children}</div>
    </div>
  );
}

export function Field({ label: l, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field">
      {l}
      {children}
      {hint && <span className="small muted" style={{ fontWeight: 400 }}>{hint}</span>}
    </label>
  );
}

export function Empty({ children, icon = "inbox" }: { children: React.ReactNode; icon?: IconName }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={20} /></span>
      <div>{children}</div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="skeleton" role="status" aria-label="Loading">
      <div /><div /><div /><div />
    </div>
  );
}

/** Dismissable in-page notice used for success messages. */
export function useNotice() {
  const [msg, setMsg] = React.useState<{ kind: "ok" | "danger" | "warn"; text: string } | null>(null);
  const flash = (text: string, kind: "ok" | "danger" | "warn" = "ok") => {
    setMsg({ kind, text });
    if (kind === "ok") setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 4000);
  };
  const node = msg ? <Alert kind={msg.kind}>{msg.text}</Alert> : null;
  return { flash, node };
}

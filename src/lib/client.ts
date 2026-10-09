"use client";

export class HttpError extends Error {
  status: number;
  details?: any;
  constructor(status: number, message: string, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Fetch wrapper for the CRM API. Throws HttpError with the server's message. */
export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`/api${path}`, { ...init, headers, body, credentials: "same-origin" });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  if (!res.ok) {
    const data = isJson ? await res.json().catch(() => ({})) : {};
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new HttpError(res.status, data.error ?? `Request failed (${res.status})`, data.details ?? data);
  }
  if (!isJson) return (await res.text()) as unknown as T;
  return res.json();
}

const aed = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 });
export const money = (v: number | null | undefined, currency = "AED") =>
  v == null ? "—" : currency === "AED" ? aed.format(Number(v)) : `${currency} ${Number(v).toLocaleString()}`;
export const num = (v: number | null | undefined) => (v == null ? "—" : Number(v).toLocaleString());

export function dateTime(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function dateOnly(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
export function relative(v: string | null | undefined) {
  if (!v) return "—";
  const diff = (new Date(v).getTime() - Date.now()) / 60_000;
  const abs = Math.abs(diff);
  const fmt = (n: number, unit: string) => `${Math.round(n)} ${unit}${Math.round(n) === 1 ? "" : "s"}`;
  const text = abs < 60 ? fmt(abs, "min") : abs < 1440 ? fmt(abs / 60, "hour") : fmt(abs / 1440, "day");
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}
/** Converts a local datetime-local input value to ISO. */
export const toIso = (local: string) => (local ? new Date(local).toISOString() : null);
export const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const label = (s: string | null | undefined) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");

export const STATUS_TONE: Record<string, string> = {
  new: "info", assigned: "info", contacted: "accent", qualified: "accent", viewing_scheduled: "accent",
  offer_submitted: "warn", won: "ok", lost: "danger", nurture: "",
  draft: "", pending_approval: "warn", active: "ok", reserved: "warn", under_offer: "warn", rented: "info",
  sold: "info", expired: "danger", archived: "",
  offer_accepted: "accent", documents_pending: "warn", contract_signed: "accent", closed_won: "ok", closed_lost: "danger",
  scheduled: "info", completed: "ok", cancelled: "danger", no_show: "danger", rescheduled: "",
  open: "info", done: "ok", approved: "ok", paid: "ok", pending: "warn",
};

import path from "node:path";
import crypto from "node:crypto";
import { db, Row } from "./db";
import { ApiError } from "./util";
import { can, type CurrentUser } from "./permissions";
import { visibleLead } from "./leads";
import { visibleProperty } from "./properties";
import { visibleDeal } from "./deals";

export const DOCUMENT_KINDS = ["document", "photo", "floor_plan", "brochure", "video", "contract", "identity", "permit"] as const;
// Serverless hosts cap request bodies at ~4.5 MB, so uploads stay under that.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ALLOWED_EXT: Record<string, string> = {
  ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv", ".txt": "text/plain", ".mp4": "video/mp4",
};

export function allowedMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mime = ALLOWED_EXT[ext];
  if (!mime) throw new ApiError(400, `File type ${ext || "(none)"} is not allowed. Allowed: ${Object.keys(ALLOWED_EXT).join(", ")}`);
  return mime;
}

/** Files live in Postgres (document_files) so they survive serverless deploys. */
export async function storeFile(buffer: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  const stored = `${crypto.randomBytes(16).toString("hex")}${ext}`;
  await db().prepare("INSERT INTO document_files (stored_name, data) VALUES (?, ?)").run(stored, buffer);
  return stored;
}

export async function readFile(stored: string): Promise<Buffer | null> {
  const row = await db().prepare("SELECT data FROM document_files WHERE stored_name = ?").get(stored);
  return row ? (row.data as Buffer) : null;
}

export async function deleteFile(stored: string) {
  await db().prepare("DELETE FROM document_files WHERE stored_name = ?").run(stored);
}

/** A document is visible when the record it is attached to is visible, and sensitive files need permission. */
export async function documentVisible(user: CurrentUser, doc: Row): Promise<boolean> {
  if (doc.sensitive && !can(user, "documents:sensitive")) return false;
  if (doc.lead_id) return !!(await visibleLead(user, doc.lead_id));
  if (doc.property_id) return !!(await visibleProperty(user, doc.property_id));
  if (doc.deal_id) return !!(await visibleDeal(user, doc.deal_id));
  return false;
}

export async function nextVersion(parent: { lead_id: number | null; property_id: number | null; deal_id: number | null }, title: string): Promise<number> {
  const col = parent.lead_id ? "lead_id" : parent.property_id ? "property_id" : "deal_id";
  const id = parent.lead_id ?? parent.property_id ?? parent.deal_id ?? null;
  const row = await db().prepare(`SELECT MAX(version) AS v FROM documents WHERE ${col} = ? AND title = ?`).get(id, title) as Row;
  return (row.v ?? 0) + 1;
}

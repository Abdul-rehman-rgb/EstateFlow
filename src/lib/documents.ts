import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db, Row } from "./db";
import { ApiError } from "./util";
import { can, type CurrentUser } from "./permissions";
import { visibleLead } from "./leads";
import { visibleProperty } from "./properties";
import { visibleDeal } from "./deals";

export const DOCUMENT_KINDS = ["document", "photo", "floor_plan", "brochure", "video", "contract", "identity", "permit"] as const;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXT: Record<string, string> = {
  ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv", ".txt": "text/plain", ".mp4": "video/mp4",
};

export function uploadDir(): string {
  const dir = process.env.CRM_UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function allowedMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mime = ALLOWED_EXT[ext];
  if (!mime) throw new ApiError(400, `File type ${ext || "(none)"} is not allowed. Allowed: ${Object.keys(ALLOWED_EXT).join(", ")}`);
  return mime;
}

export function storeFile(buffer: Buffer, filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const stored = `${crypto.randomBytes(16).toString("hex")}${ext}`;
  fs.writeFileSync(path.join(uploadDir(), stored), buffer);
  return stored;
}

/** A document is visible when the record it is attached to is visible, and sensitive files need permission. */
export function documentVisible(user: CurrentUser, doc: Row): boolean {
  if (doc.sensitive && !can(user, "documents:sensitive")) return false;
  if (doc.lead_id) return !!visibleLead(user, doc.lead_id);
  if (doc.property_id) return !!visibleProperty(user, doc.property_id);
  if (doc.deal_id) return !!visibleDeal(user, doc.deal_id);
  return false;
}

export function nextVersion(parent: { lead_id: number | null; property_id: number | null; deal_id: number | null }, title: string): number {
  const col = parent.lead_id ? "lead_id" : parent.property_id ? "property_id" : "deal_id";
  const id = parent.lead_id ?? parent.property_id ?? parent.deal_id ?? null;
  const row = db().prepare(`SELECT MAX(version) AS v FROM documents WHERE ${col} = ? AND title = ?`).get(id, title) as Row;
  return (row.v ?? 0) + 1;
}

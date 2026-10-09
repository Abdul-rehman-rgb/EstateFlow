import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api } from "@/lib/http";
import { ApiError, int, nowIso, oneOf, str } from "@/lib/util";
import { can, requirePerm } from "@/lib/permissions";
import { visibleLead } from "@/lib/leads";
import { visibleProperty } from "@/lib/properties";
import { visibleDeal } from "@/lib/deals";
import {
  allowedMime, DOCUMENT_KINDS, documentVisible, MAX_UPLOAD_BYTES, nextVersion, storeFile,
} from "@/lib/documents";

const COLUMNS = "id, lead_id, property_id, deal_id, kind, title, original_name, mime, size, version, approval_status, expires_at, sensitive, uploaded_by, created_at";

export const GET = api(async (req, user) => {
  const q = new URL(req.url).searchParams;
  const leadId = int(q.get("lead_id")), propertyId = int(q.get("property_id")), dealId = int(q.get("deal_id"));
  if (!leadId && !propertyId && !dealId) throw new ApiError(400, "Provide lead_id, property_id or deal_id.");
  if (leadId && !await visibleLead(user, leadId)) throw new ApiError(404, "Lead not found.");
  if (propertyId && !await visibleProperty(user, propertyId)) throw new ApiError(404, "Property not found.");
  if (dealId && !await visibleDeal(user, dealId)) throw new ApiError(404, "Deal not found.");
  const col = leadId ? "lead_id = ?" : propertyId ? "property_id = ?" : "deal_id = ?";
  const rows = await db().prepare(
    `SELECT ${COLUMNS} FROM documents WHERE ${col} ORDER BY title, version DESC`,
  ).all(leadId ?? propertyId ?? dealId) as Row[];
  return { documents: rows.filter((d) => !d.sensitive || can(user, "documents:sensitive")) };
});

export const POST = api(async (req, user) => {
  requirePerm(user, "documents:write");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ApiError(400, "Choose a file to upload.");
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "Files must be 4 MB or smaller.");
  const mime = allowedMime(file.name);

  const parent = {
    lead_id: int(form.get("lead_id")), property_id: int(form.get("property_id")), deal_id: int(form.get("deal_id")),
  };
  const ok = parent.lead_id ? await visibleLead(user, parent.lead_id)
    : parent.property_id ? await visibleProperty(user, parent.property_id)
    : parent.deal_id ? await visibleDeal(user, parent.deal_id) : null;
  if (!ok) throw new ApiError(400, "Attach the document to a visible lead, property or deal.");

  const title = str(form.get("title")) ?? file.name;
  const kind = oneOf(form.get("kind") ?? "document", DOCUMENT_KINDS, "document kind");
  const sensitive = form.get("sensitive") === "true" || form.get("sensitive") === "on";
  if (sensitive && !can(user, "documents:sensitive")) throw new ApiError(403, "Your role cannot upload sensitive documents.");
  const expiresAt = str(form.get("expires_at"));

  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await storeFile(buffer, file.name);
  const id = await tx(async () => {
    const now = nowIso();
    const res = await db().prepare(
      `INSERT INTO documents (lead_id, property_id, deal_id, kind, title, original_name, stored_name, mime, size, version,
        approval_status, expires_at, sensitive, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    ).run(parent.lead_id, parent.property_id, parent.deal_id, kind, title, file.name, stored, mime, buffer.length,
      await nextVersion(parent, title), expiresAt ? new Date(expiresAt).toISOString() : null, sensitive ? 1 : 0, user.id, now);
    const did = Number(res.lastInsertRowid);
    await audit(user.id, "upload", "document", did, { title, file: file.name, sensitive });
    return did;
  });
  return await db().prepare(`SELECT ${COLUMNS} FROM documents WHERE id = ?`).get(id);
});

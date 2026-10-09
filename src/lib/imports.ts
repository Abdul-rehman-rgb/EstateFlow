import { db, Row, tx } from "./db";
import { audit } from "./audit";
import { ApiError, nowIso, parseCsv } from "./util";
import { type CurrentUser, scopeOf } from "./permissions";
import { defaultBranchId, findDuplicates, leadInput, logActivity, pickAssignee } from "./leads";
import { propertyInput, nextRef } from "./properties";

export const IMPORT_ENTITIES = ["leads", "properties"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

export const TEMPLATE_COLUMNS: Record<ImportEntity, string[]> = {
  leads: ["name", "phone", "email", "source", "purpose", "property_type", "preferred_area", "budget_min", "budget_max",
    "bedrooms", "timeline", "language", "nationality", "campaign", "portal_ref"],
  properties: ["ref", "title", "category", "listing_type", "sale_mode", "price", "size_sqft", "bedrooms", "bathrooms",
    "emirate", "location", "owner_name", "owner_phone", "permit_number", "permit_expiry", "description"],
};

const MAX_ROWS = 2000;

export function templateCsv(entity: ImportEntity): string {
  return TEMPLATE_COLUMNS[entity].join(",") + "\r\n";
}

type Parsed = { row: number; data: Row }[];

function parseFile(text: string, entity: ImportEntity): { rows: Parsed; headerErrors: string[] } {
  const table = parseCsv(text);
  if (table.length < 2) throw new ApiError(400, "The file needs a header row and at least one data row.");
  if (table.length - 1 > MAX_ROWS) throw new ApiError(400, `Import up to ${MAX_ROWS} rows at a time.`);
  const allowed = TEMPLATE_COLUMNS[entity];
  const headers = table[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const headerErrors = headers.filter((h) => h && !allowed.includes(h)).map((h) => `Unknown column "${h}" will be ignored.`);
  const rows = table.slice(1).map((cells, i) => {
    const data: Row = {};
    headers.forEach((h, idx) => {
      if (h && allowed.includes(h)) data[h] = (cells[idx] ?? "").trim() || undefined;
    });
    return { row: i + 2, data };
  });
  return { rows, headerErrors };
}

export async function runImport(user: CurrentUser, entity: ImportEntity, text: string, commit: boolean) {
  const { rows, headerErrors } = parseFile(text, entity);
  const errors: { row: number; message: string }[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const valid: { row: number; input: Row }[] = [];
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();
  const branchId = scopeOf(user) === "all" ? await defaultBranchId(user) : user.branch_id;

  for (const { row, data } of rows) {
    try {
      if (entity === "leads") {
        const input = leadInput(data, false);
        if (input.phone_norm && seenPhones.has(input.phone_norm) || input.email_norm && seenEmails.has(input.email_norm)) {
          skipped.push({ row, reason: "Duplicate of an earlier row in this file" });
          continue;
        }
        if ((await findDuplicates(input.phone_norm, input.email_norm)).length) {
          skipped.push({ row, reason: "Already exists in the CRM" });
          continue;
        }
        if (input.phone_norm) seenPhones.add(input.phone_norm);
        if (input.email_norm) seenEmails.add(input.email_norm);
        valid.push({ row, input: { ...input, branch_id: branchId } });
      } else {
        const input = propertyInput(data, false);
        if (data.ref && (await db().prepare("SELECT id FROM properties WHERE ref = ?").get(data.ref))) {
          skipped.push({ row, reason: `Reference ${data.ref} already exists` });
          continue;
        }
        valid.push({ row, input: { ...input, ref: data.ref ?? null, branch_id: branchId } });
      }
    } catch (err) {
      errors.push({ row, message: err instanceof ApiError ? err.message : "Invalid row." });
    }
  }

  const summary = {
    entity, total: rows.length, valid: valid.length, invalid: errors.length, skipped: skipped.length,
    header_warnings: headerErrors, errors, skipped_rows: skipped,
    preview: valid.slice(0, 5).map((v) => ({ row: v.row, ...v.input })),
  };
  if (!commit) return { dryRun: true, ...summary };

  if (!valid.length) throw new ApiError(400, "No valid rows to import.", summary);
  const createdIds: number[] = [];
  await tx(async () => {
    for (const { input } of valid) {
      const now = nowIso();
      if (entity === "leads") {
        const assignee = await pickAssignee(input.branch_id ?? null);
        const cols: Row = { ...input, status: assignee ? "assigned" : "new", assigned_to: assignee,
          created_by: user.id, created_at: now, updated_at: now };
        const keys = Object.keys(cols);
        const id = (await db().prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
          .run(...keys.map((k) => cols[k] ?? null))).lastInsertRowid;
        await logActivity({ leadId: id, kind: "system", userId: user.id, body: "Imported from spreadsheet." });
        createdIds.push(id);
      } else {
        const cols: Row = { ...input, status: "draft", listed_by: user.id, created_at: now, updated_at: now };
        const ref = cols.ref;
        delete cols.ref;
        cols.ref = `TMP-${Date.now()}-${createdIds.length}`;
        const keys = Object.keys(cols);
        const id = (await db().prepare(`INSERT INTO properties (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
          .run(...keys.map((k) => cols[k] ?? null))).lastInsertRowid;
        await db().prepare("UPDATE properties SET ref = ? WHERE id = ?").run(ref ?? nextRef(id), id);
        createdIds.push(id);
      }
    }
    await audit(user.id, "import", entity, null, { created: createdIds.length, skipped: skipped.length, invalid: errors.length });
  });
  return { dryRun: false, ...summary, created: createdIds.length };
}

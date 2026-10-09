import { api, csvResponse } from "@/lib/http";
import { ApiError } from "@/lib/util";
import { requirePerm } from "@/lib/permissions";
import { IMPORT_ENTITIES, ImportEntity, runImport, templateCsv } from "@/lib/imports";

function entityOf(v: string): ImportEntity {
  if (!(IMPORT_ENTITIES as readonly string[]).includes(v)) throw new ApiError(404, "Unknown import type.");
  return v as ImportEntity;
}

/** GET downloads the CSV template for the entity. */
export const GET = api(async (_req, user, p) => {
  requirePerm(user, "import:write");
  return csvResponse(`${entityOf(p.entity)}-template.csv`, templateCsv(entityOf(p.entity)));
});

/**
 * POST uploads a CSV. Without ?commit=1 it validates and previews only (dry run).
 * With ?commit=1 it inserts all valid, non-duplicate rows in one transaction.
 */
export const POST = api(async (req, user, p) => {
  requirePerm(user, "import:write");
  const entity = entityOf(p.entity);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "Upload a CSV file.");
  if (!file.name.toLowerCase().endsWith(".csv")) throw new ApiError(400, "Only CSV files are supported. Export your spreadsheet as CSV first.");
  const commit = new URL(req.url).searchParams.get("commit") === "1";
  return await runImport(user, entity, await file.text(), commit);
});

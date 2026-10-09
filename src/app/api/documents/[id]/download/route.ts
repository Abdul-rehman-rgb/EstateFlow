import fs from "node:fs";
import path from "node:path";
import { db, Row } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, idParam } from "@/lib/http";
import { ApiError } from "@/lib/util";
import { documentVisible, uploadDir } from "@/lib/documents";

export const GET = api(async (_req, user, p) => {
  const doc = db().prepare("SELECT * FROM documents WHERE id = ?").get(idParam(p.id)) as Row | undefined;
  if (!doc || !documentVisible(user, doc)) throw new ApiError(404, "Document not found.");
  const file = path.join(uploadDir(), path.basename(doc.stored_name));
  if (!fs.existsSync(file)) throw new ApiError(404, "File is missing from storage.");
  audit(user.id, "download", "document", doc.id, { title: doc.title });
  const safeName = doc.original_name.replace(/[^\w.\- ]/g, "_");
  return new Response(fs.readFileSync(file), {
    headers: {
      "Content-Type": doc.mime ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
});

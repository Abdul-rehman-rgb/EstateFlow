import { db, Row } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, idParam } from "@/lib/http";
import { ApiError } from "@/lib/util";
import { documentVisible, readFile } from "@/lib/documents";

export const GET = api(async (_req, user, p) => {
  const doc = await db().prepare("SELECT * FROM documents WHERE id = ?").get(idParam(p.id)) as Row | undefined;
  if (!doc || !await documentVisible(user, doc)) throw new ApiError(404, "Document not found.");
  const file = await readFile(doc.stored_name);
  if (!file) throw new ApiError(404, "File is missing from storage.");
  await audit(user.id, "download", "document", doc.id, { title: doc.title });
  const safeName = doc.original_name.replace(/[^\w.\- ]/g, "_");
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": doc.mime ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
});

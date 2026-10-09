import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, idParam, readJson } from "@/lib/http";
import { ApiError, nowIso, oneOf, str } from "@/lib/util";
import { can, requirePerm } from "@/lib/permissions";
import { deleteFile, documentVisible } from "@/lib/documents";

async function load(id: number, user: Parameters<typeof documentVisible>[0]): Promise<Row> {
  const doc = await db().prepare("SELECT * FROM documents WHERE id = ?").get(id) as Row | undefined;
  if (!doc || !await documentVisible(user, doc)) throw new ApiError(404, "Document not found.");
  return doc;
}

export const PATCH = api(async (req, user, p) => {
  const doc = await load(idParam(p.id), user);
  const body = await readJson(req);
  const changes: Row = {};
  if (body.approval_status !== undefined) {
    // Approval is a manager decision.
    requirePerm(user, "properties:approve");
    changes.approval_status = oneOf(body.approval_status, ["pending", "approved", "rejected"] as const, "approval status");
  }
  if (body.expires_at !== undefined) changes.expires_at = body.expires_at ? new Date(String(body.expires_at)).toISOString() : null;
  if (body.title !== undefined) changes.title = str(body.title) ?? doc.title;
  if (!Object.keys(changes).length) return doc;
  requirePerm(user, "documents:write");
  await tx(async () => {
    const keys = Object.keys(changes);
    await db().prepare(`UPDATE documents SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
      .run(...keys.map((k) => changes[k] ?? null), doc.id);
    await audit(user.id, "update", "document", doc.id, { fields: keys });
  });
  return await db().prepare("SELECT * FROM documents WHERE id = ?").get(doc.id);
});

/** Deleting removes the file from storage. Only managers may delete; the action is audited. */
export const DELETE = api(async (_req, user, p) => {
  if (!can(user, "documents:sensitive")) throw new ApiError(403, "Only managers can delete documents.");
  const doc = await load(idParam(p.id), user);
  await tx(async () => {
    await db().prepare("DELETE FROM documents WHERE id = ?").run(doc.id);
    await deleteFile(doc.stored_name);
    await audit(user.id, "delete", "document", doc.id, { title: doc.title, original_name: doc.original_name });
  });
  return { ok: true };
});

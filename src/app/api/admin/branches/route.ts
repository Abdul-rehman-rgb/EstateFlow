import { db, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, readJson } from "@/lib/http";
import { requireFields, str } from "@/lib/util";
import { requirePerm } from "@/lib/permissions";

export const GET = api(async () => ({ branches: db().prepare("SELECT * FROM branches ORDER BY name").all() }));

export const POST = api(async (req, user) => {
  requirePerm(user, "users:manage");
  const body = await readJson(req);
  requireFields(body, ["name"]);
  const id = tx(() => {
    const r = db().prepare("INSERT INTO branches (name, emirate) VALUES (?, ?)").run(str(body.name), str(body.emirate) ?? "Dubai");
    audit(user.id, "create", "branch", Number(r.lastInsertRowid), { name: body.name });
    return Number(r.lastInsertRowid);
  });
  return db().prepare("SELECT * FROM branches WHERE id = ?").get(id);
});

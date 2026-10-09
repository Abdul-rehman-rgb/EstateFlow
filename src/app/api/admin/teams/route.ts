import { db, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, readJson } from "@/lib/http";
import { int, requireFields, str } from "@/lib/util";
import { requirePerm } from "@/lib/permissions";

export const GET = api(async () => ({
  teams: await db().prepare(
    `SELECT t.*, b.name AS branch_name, u.name AS leader_name FROM teams t
     JOIN branches b ON b.id = t.branch_id LEFT JOIN users u ON u.id = t.leader_id ORDER BY t.name`,
  ).all(),
}));

export const POST = api(async (req, user) => {
  requirePerm(user, "users:manage");
  const body = await readJson(req);
  requireFields(body, ["name", "branch_id"]);
  const id = await tx(async () => {
    const r = await db().prepare("INSERT INTO teams (name, branch_id, leader_id) VALUES (?, ?, ?)")
      .run(str(body.name), int(body.branch_id), int(body.leader_id));
    await audit(user.id, "create", "team", Number(r.lastInsertRowid), { name: body.name });
    return Number(r.lastInsertRowid);
  });
  return await db().prepare("SELECT * FROM teams WHERE id = ?").get(id);
});

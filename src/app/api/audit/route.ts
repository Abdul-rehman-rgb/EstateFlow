import { db, Row } from "@/lib/db";
import { api } from "@/lib/http";
import { int } from "@/lib/util";
import { requirePerm } from "@/lib/permissions";

export const GET = api(async (req, user) => {
  requirePerm(user, "audit:read");
  const q = new URL(req.url).searchParams;
  const where: string[] = ["1=1"];
  const params: (string | number | null)[] = [];
  if (q.get("entity")) { where.push("a.entity = ?"); params.push(q.get("entity")!); }
  if (q.get("entity_id")) { where.push("a.entity_id = ?"); params.push(int(q.get("entity_id"))); }
  if (q.get("user_id")) { where.push("a.user_id = ?"); params.push(int(q.get("user_id"))); }
  if (q.get("action")) { where.push("a.action = ?"); params.push(q.get("action")!); }
  const limit = Math.min(int(q.get("limit")) ?? 200, 1000);
  const rows = await db().prepare(
    `SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE ${where.join(" AND ")} ORDER BY a.id DESC LIMIT ?`,
  ).all(...params, limit) as Row[];
  return { entries: rows.map((r) => ({ ...r, details: r.details ? JSON.parse(r.details) : null })) };
});

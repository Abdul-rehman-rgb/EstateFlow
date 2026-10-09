import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, readJson } from "@/lib/http";
import { ApiError, int, nowIso, str } from "@/lib/util";
import { requirePerm, inventoryScope, scopeOf } from "@/lib/permissions";
import { nextRef, propertyInput } from "@/lib/properties";

export const GET = api(async (req, user) => {
  const q = new URL(req.url).searchParams;
  const scope = inventoryScope(user);
  const where = [scope.sql];
  const params: (string | number | null)[] = [...scope.params];
  if (q.get("status")) { where.push("p.status = ?"); params.push(q.get("status")!); }
  if (q.get("category")) { where.push("p.category = ?"); params.push(q.get("category")!); }
  if (q.get("listing_type")) { where.push("p.listing_type = ?"); params.push(q.get("listing_type")!); }
  if (q.get("emirate")) { where.push("p.emirate = ?"); params.push(q.get("emirate")!); }
  if (q.get("min_price")) { where.push("p.price >= ?"); params.push(Number(q.get("min_price"))); }
  if (q.get("max_price")) { where.push("p.price <= ?"); params.push(Number(q.get("max_price"))); }
  if (q.get("bedrooms")) { where.push("p.bedrooms = ?"); params.push(int(q.get("bedrooms"))); }
  if (q.get("q")) {
    const like = `%${q.get("q")}%`;
    where.push("(p.title LIKE ? OR p.ref LIKE ? OR p.location LIKE ?)");
    params.push(like, like, like);
  }
  const rows = db()
    .prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM leads l WHERE l.property_id = p.id) AS enquiries
       FROM properties p WHERE ${where.join(" AND ")} ORDER BY p.updated_at DESC LIMIT 300`,
    )
    .all(...params);
  return { properties: rows };
});

export const POST = api(async (req, user) => {
  requirePerm(user, "properties:write");
  const body = await readJson(req);
  const input = propertyInput(body, false);
  const branchId = scopeOf(user) === "all" ? int(body.branch_id) ?? user.branch_id : user.branch_id;
  const now = nowIso();
  const id = tx(() => {
    const cols: Row = { ...input, ref: `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, branch_id: branchId,
      status: "draft", listed_by: user.id, created_at: now, updated_at: now };
    const keys = Object.keys(cols);
    const res = db().prepare(`INSERT INTO properties (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
      .run(...keys.map((k) => cols[k] ?? null));
    const pid = Number(res.lastInsertRowid);
    const ref = str(body.ref) ?? nextRef(pid);
    db().prepare("UPDATE properties SET ref = ? WHERE id = ?").run(ref, pid);
    audit(user.id, "create", "property", pid, { ref, title: input.title });
    return pid;
  });
  return db().prepare("SELECT * FROM properties WHERE id = ?").get(id);
});


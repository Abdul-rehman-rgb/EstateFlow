import { db, Row, tx, settings } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, readJson } from "@/lib/http";
import { ApiError, int, str } from "@/lib/util";
import { can, ownerScope, requirePerm, scopeOf } from "@/lib/permissions";
import {
  defaultBranchId, findDuplicates, leadInput, logActivity, pickAssignee, scoreLead, validateStatus,
} from "@/lib/leads";

export const GET = api(async (req, user) => {
  requirePerm(user, "leads:write");
  const q = new URL(req.url).searchParams;
  const scope = ownerScope(user, "l.assigned_to", "l.branch_id", { unassignedVisible: true });
  const where = [scope.sql];
  const params: (string | number | null)[] = [...scope.params];
  if (q.get("status")) { where.push("l.status = ?"); params.push(q.get("status")!); }
  if (q.get("source")) { where.push("l.source = ?"); params.push(q.get("source")!); }
  if (q.get("assigned") === "unassigned") where.push("l.assigned_to IS NULL");
  else if (q.get("assigned")) { where.push("l.assigned_to = ?"); params.push(int(q.get("assigned"))); }
  if (q.get("q")) {
    const like = `%${q.get("q")}%`;
    where.push("(l.name LIKE ? OR l.phone LIKE ? OR l.email LIKE ?)");
    params.push(like, like, like);
  }
  const rows = db()
    .prepare(
      `SELECT l.*, u.name AS assigned_name FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
       WHERE ${where.join(" AND ")} ORDER BY l.created_at DESC LIMIT 300`,
    )
    .all(...params) as Row[];
  const leads = rows.map((r) => ({ ...r, ...scoreLead(r) }));
  leads.sort((a, b) => b.score - a.score);
  return { leads, total: leads.length };
});

export const POST = api(async (req, user) => {
  requirePerm(user, "leads:write");
  const body = await readJson(req);
  const input = leadInput(body, false);
  const branchId = scopeOf(user) === "all"
    ? int(body.branch_id) ?? defaultBranchId(user)
    : user.branch_id;
  input.branch_id = branchId;

  const duplicates = findDuplicates(input.phone_norm, input.email_norm);
  if (duplicates.length && !body.allow_duplicate) {
    throw new ApiError(409, "A lead with this phone or email already exists. Review the duplicates or confirm to create anyway.", { duplicates });
  }

  let assignee: number | null = null;
  if (body.assigned_to !== undefined && body.assigned_to !== null && body.assigned_to !== "") {
    assignee = int(body.assigned_to);
    const target = db().prepare("SELECT id, branch_id, active FROM users WHERE id = ?").get(assignee) as Row | undefined;
    if (!target || !target.active || target.branch_id !== branchId) throw new ApiError(400, "Assignee must be an active user in the lead's branch.");
  } else {
    assignee = pickAssignee(branchId);
  }

  const status = body.status ? validateStatus(body.status) : assignee ? "assigned" : "new";
  const now = new Date().toISOString();
  const id = tx(() => {
    const cols = { ...input, status, assigned_to: assignee, created_by: user.id, created_at: now, updated_at: now };
    const keys = Object.keys(cols);
    const res = db()
      .prepare(`INSERT INTO leads (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
      .run(...keys.map((k) => cols[k as keyof typeof cols] ?? null));
    const leadId = Number(res.lastInsertRowid);
    logActivity({
      leadId, kind: "system", userId: user.id,
      body: `Lead created${input.source ? ` from ${input.source}` : ""}${assignee ? " and assigned" : ""}.`,
    });
    audit(user.id, "create", "lead", leadId, { name: input.name, assigned_to: assignee });
    return leadId;
  });
  return db().prepare("SELECT * FROM leads WHERE id = ?").get(id);
});

import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, readJson } from "@/lib/http";
import { ApiError, int, nowIso, oneOf, str } from "@/lib/util";
import { ownerScope, requirePerm } from "@/lib/permissions";
import { PRIORITIES } from "@/lib/tasks";


export const GET = api(async (req, user) => {
  const q = new URL(req.url).searchParams;
  const where: string[] = [];
  const params: (string | number | null)[] = [];
  const scope = q.get("scope") ?? "mine";
  if (scope === "mine") { where.push("t.assigned_to = ?"); params.push(user.id); }
  else { where.push(ownerScope(user, "t.assigned_to", "t.branch_id").sql); params.push(...ownerScope(user, "t.assigned_to", "t.branch_id").params); }
  const status = q.get("status") ?? "open";
  if (status === "overdue") { where.push("t.status = 'open' AND t.due_at < ?"); params.push(nowIso()); }
  else if (status !== "all") { where.push("t.status = ?"); params.push(status); }
  if (q.get("lead_id")) { where.push("t.lead_id = ?"); params.push(int(q.get("lead_id"))); }
  const rows = db().prepare(
    `SELECT t.*, u.name AS assignee_name, l.name AS lead_name, p.ref AS property_ref
     FROM tasks t JOIN users u ON u.id = t.assigned_to
     LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN properties p ON p.id = t.property_id
     WHERE ${where.join(" AND ")} ORDER BY t.due_at IS NULL, t.due_at, t.id LIMIT 500`,
  ).all(...params);
  return { tasks: rows };
});

export const POST = api(async (req, user) => {
  requirePerm(user, "tasks:write");
  const body = await readJson(req);
  const title = str(body.title);
  if (!title) throw new ApiError(400, "Task title is required.");
  const assignee = int(body.assigned_to) ?? user.id;
  const target = db().prepare("SELECT id, branch_id, active FROM users WHERE id = ?").get(assignee) as Row | undefined;
  if (!target || !target.active) throw new ApiError(400, "Assignee not found.");
  if (user.role !== "super_admin" && user.role !== "owner" && target.branch_id !== user.branch_id) {
    throw new ApiError(400, "You can only assign tasks within your branch.");
  }
  const priority = oneOf(body.priority ?? "normal", PRIORITIES, "priority");
  const leadId = int(body.lead_id);
  const now = nowIso();
  const id = tx(() => {
    const res = db().prepare(
      `INSERT INTO tasks (title, lead_id, property_id, deal_id, branch_id, assigned_to, due_at, priority, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(title, leadId, int(body.property_id), int(body.deal_id), target.branch_id, assignee,
      body.due_at ? new Date(String(body.due_at)).toISOString() : null, priority, user.id, now);
    const tid = Number(res.lastInsertRowid);
    audit(user.id, "create", "task", tid, { assigned_to: assignee });
    return tid;
  });
  return db().prepare("SELECT * FROM tasks WHERE id = ?").get(id);
});

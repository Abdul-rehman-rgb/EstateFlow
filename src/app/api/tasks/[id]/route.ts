import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, idParam, readJson } from "@/lib/http";
import { ApiError, int, nowIso, oneOf, str } from "@/lib/util";
import { ownerScope, requirePerm } from "@/lib/permissions";
import { PRIORITIES } from "@/lib/tasks";

async function visibleTask(user: Parameters<typeof ownerScope>[0], id: number): Promise<Row | undefined> {
  const scope = ownerScope(user, "assigned_to", "branch_id");
  return await db().prepare(`SELECT * FROM tasks WHERE id = ? AND ${scope.sql}`).get(id, ...scope.params) as Row | undefined;
}

export const PATCH = api(async (req, user, p) => {
  requirePerm(user, "tasks:write");
  const id = idParam(p.id);
  const task = await visibleTask(user, id);
  if (!task) throw new ApiError(404, "Task not found.");
  const body = await readJson(req);
  const changes: Row = {};
  if (body.title !== undefined) changes.title = str(body.title) ?? task.title;
  if (body.due_at !== undefined) changes.due_at = body.due_at ? new Date(String(body.due_at)).toISOString() : null;
  if (body.priority !== undefined) changes.priority = oneOf(body.priority, PRIORITIES, "priority");
  if (body.status !== undefined) {
    changes.status = oneOf(body.status, ["open", "done"] as const, "status");
    changes.completed_at = changes.status === "done" ? nowIso() : null;
  }
  if (body.assigned_to !== undefined) {
    const target = await db().prepare("SELECT id, branch_id, active FROM users WHERE id = ?").get(int(body.assigned_to)) as Row | undefined;
    if (!target || !target.active || (user.role !== "super_admin" && user.role !== "owner" && target.branch_id !== user.branch_id)) {
      throw new ApiError(400, "Assignee must be an active user in your branch.");
    }
    changes.assigned_to = target.id;
    changes.branch_id = target.branch_id;
  }
  if (Object.keys(changes).length) {
    await tx(async () => {
      const keys = Object.keys(changes);
      await db().prepare(`UPDATE tasks SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
        .run(...keys.map((k) => changes[k] ?? null), id);
      await audit(user.id, "update", "task", id, { fields: keys });
    });
  }
  return await db().prepare("SELECT * FROM tasks WHERE id = ?").get(id);
});

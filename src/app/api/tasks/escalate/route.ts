import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api } from "@/lib/http";
import { addHours, nowIso } from "@/lib/util";
import { ownerScope, requirePerm } from "@/lib/permissions";

const ESCALATE_AFTER_HOURS = 24;

/**
 * Escalates open tasks overdue by more than 24h to the assignee's team leader,
 * or to the branch manager when the agent has no team leader.
 */
export const POST = api(async (_req, user) => {
  requirePerm(user, "tasks:escalate");
  const scope = ownerScope(user, "t.assigned_to", "t.branch_id");
  const cutoff = addHours(nowIso(), -ESCALATE_AFTER_HOURS);
  const overdue = db().prepare(
    `SELECT t.id, t.assigned_to, t.branch_id, u.team_id FROM tasks t JOIN users u ON u.id = t.assigned_to
     WHERE t.status = 'open' AND t.escalated_to IS NULL AND t.due_at IS NOT NULL AND t.due_at < ? AND ${scope.sql}`,
  ).all(cutoff, ...scope.params) as Row[];

  let escalated = 0;
  tx(() => {
    for (const t of overdue) {
      const leader = t.team_id
        ? (db().prepare("SELECT leader_id FROM teams WHERE id = ?").get(t.team_id) as Row | undefined)?.leader_id
        : null;
      const manager = leader ?? (db().prepare(
        "SELECT id FROM users WHERE role = 'branch_manager' AND branch_id = ? AND active = 1 LIMIT 1",
      ).get(t.branch_id) as Row | undefined)?.id;
      if (!manager || manager === t.assigned_to) continue;
      db().prepare("UPDATE tasks SET escalated_to = ? WHERE id = ?").run(manager, t.id);
      escalated++;
    }
    audit(user.id, "escalate_tasks", "task", null, { count: escalated });
  });
  return { escalated };
});

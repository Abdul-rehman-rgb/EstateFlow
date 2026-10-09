import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, idParam, readJson } from "@/lib/http";
import { ApiError, int } from "@/lib/util";
import { requirePerm } from "@/lib/permissions";
import { logActivity, visibleLead } from "@/lib/leads";

export const POST = api(async (req, user, p) => {
  requirePerm(user, "leads:write");
  const id = idParam(p.id);
  const lead = await visibleLead(user, id);
  if (!lead) throw new ApiError(404, "Lead not found.");
  const body = await readJson(req);
  const assignee = body.user_id === null || body.user_id === undefined || body.user_id === "" ? null : int(body.user_id);
  if (assignee !== null) {
    const target = await db().prepare("SELECT id, name, branch_id, active, role FROM users WHERE id = ?").get(assignee) as Row | undefined;
    if (!target || !target.active) throw new ApiError(400, "Assignee not found or inactive.");
    if (target.branch_id !== lead.branch_id) throw new ApiError(400, "Assignee must belong to the lead's branch.");
    if (!["agent", "team_leader", "branch_manager"].includes(target.role)) throw new ApiError(400, "Only agents or managers can own leads.");
  }
  await tx(async () => {
    const nextStatus = assignee && lead.status === "new" ? "assigned" : lead.status;
    await db().prepare("UPDATE leads SET assigned_to = ?, status = ?, updated_at = ? WHERE id = ?")
      .run(assignee, nextStatus, new Date().toISOString(), id);
    const name = assignee ? (await db().prepare("SELECT name FROM users WHERE id = ?").get(assignee) as Row).name : "unassigned";
    await logActivity({ leadId: id, kind: "system", userId: user.id, body: `Lead assigned to ${name}.` });
    await audit(user.id, "assign", "lead", id, { assigned_to: assignee });
  });
  return { ok: true, assigned_to: assignee };
});

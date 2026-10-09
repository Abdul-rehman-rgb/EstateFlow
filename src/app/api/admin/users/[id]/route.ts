import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, idParam, readJson } from "@/lib/http";
import { ApiError, int, nowIso, oneOf, str } from "@/lib/util";
import { requirePerm, ROLES, type Role } from "@/lib/permissions";
import { hashPassword } from "@/lib/password";

export const PATCH = api(async (req, user, p) => {
  requirePerm(user, "users:manage");
  const id = idParam(p.id);
  const target = db().prepare("SELECT * FROM users WHERE id = ?").get(id) as Row | undefined;
  if (!target) throw new ApiError(404, "User not found.");
  const body = await readJson(req);
  const changes: Row = {};
  if (body.name !== undefined) changes.name = str(body.name) ?? target.name;
  if (body.role !== undefined) changes.role = oneOf(body.role, ROLES as unknown as readonly Role[], "role");
  if (body.branch_id !== undefined) changes.branch_id = int(body.branch_id);
  if (body.team_id !== undefined) changes.team_id = int(body.team_id);
  if (body.active !== undefined) {
    if (id === user.id && !body.active) throw new ApiError(400, "You cannot deactivate your own account.");
    changes.active = body.active ? 1 : 0;
  }
  if (body.password !== undefined) {
    const pw = String(body.password);
    if (pw.length < 8) throw new ApiError(400, "Password must be at least 8 characters.");
    changes.password_hash = hashPassword(pw);
  }
  const finalRole = changes.role ?? target.role;
  const finalBranch = changes.branch_id !== undefined ? changes.branch_id : target.branch_id;
  if (["agent", "team_leader", "branch_manager"].includes(finalRole) && !finalBranch) {
    throw new ApiError(400, "Agents and managers must belong to a branch.");
  }
  if (Object.keys(changes).length) {
    tx(() => {
      const keys = Object.keys(changes);
      db().prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...keys.map((k) => changes[k] ?? null), id);
      if (changes.active === 0) db().prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
      audit(user.id, "update", "user", id, { fields: keys.filter((k) => k !== "password_hash"), password_reset: "password_hash" in changes });
    });
  }
  return db().prepare("SELECT id, name, email, role, branch_id, team_id, active FROM users WHERE id = ?").get(id);
});

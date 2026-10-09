import { db, Row, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { api, readJson } from "@/lib/http";
import { ApiError, int, nowIso, oneOf, requireFields, str } from "@/lib/util";
import { requirePerm, ROLES, type Role } from "@/lib/permissions";
import { hashPassword } from "@/lib/password";

export const GET = api(async (_req, user) => {
  requirePerm(user, "users:manage");
  return {
    users: db().prepare(
      `SELECT u.id, u.name, u.email, u.role, u.branch_id, u.team_id, u.active, b.name AS branch_name, t.name AS team_name
       FROM users u LEFT JOIN branches b ON b.id = u.branch_id LEFT JOIN teams t ON t.id = u.team_id ORDER BY u.name`,
    ).all(),
  };
});

export const POST = api(async (req, user) => {
  requirePerm(user, "users:manage");
  const body = await readJson(req);
  requireFields(body, ["name", "email", "role", "password"]);
  const role = oneOf(body.role, ROLES as unknown as readonly Role[], "role");
  const password = String(body.password);
  if (password.length < 8) throw new ApiError(400, "Temporary password must be at least 8 characters.");
  const branchId = int(body.branch_id);
  if (["agent", "team_leader", "branch_manager"].includes(role) && !branchId) {
    throw new ApiError(400, "Agents and managers must belong to a branch.");
  }
  const email = String(body.email).trim().toLowerCase();
  if (db().prepare("SELECT id FROM users WHERE email = ?").get(email)) throw new ApiError(409, "A user with this email already exists.");
  const id = tx(() => {
    const res = db().prepare(
      "INSERT INTO users (name, email, password_hash, role, branch_id, team_id, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
    ).run(str(body.name), email, hashPassword(password), role, branchId, int(body.team_id), nowIso());
    const uid = Number(res.lastInsertRowid);
    audit(user.id, "create", "user", uid, { role, branch_id: branchId });
    return uid;
  });
  return db().prepare("SELECT id, name, email, role, branch_id, team_id, active FROM users WHERE id = ?").get(id);
});

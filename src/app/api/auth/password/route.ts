import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { api, readJson } from "@/lib/http";
import { ApiError } from "@/lib/util";
import { audit } from "@/lib/audit";

export const POST = api(async (req, user) => {
  const body = await readJson(req);
  const row = await db().prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
  if (!verifyPassword(String(body.current ?? ""), row.password_hash)) throw new ApiError(400, "Current password is incorrect.");
  const next = String(body.next ?? "");
  if (next.length < 8) throw new ApiError(400, "New password must be at least 8 characters.");
  await db().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(next), user.id);
  await audit(user.id, "password_change", "user", user.id);
  return { ok: true };
});

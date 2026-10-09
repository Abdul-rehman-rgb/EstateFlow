import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { ApiError } from "./util";

export { hashPassword, verifyPassword };

export const SESSION_COOKIE = "crm_session";
const SESSION_HOURS = 12;

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = Date.now() + SESSION_HOURS * 3_600_000;
  db().prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expires);
  return token;
}

export function destroySession(token: string) {
  db().prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  };
}

export type CurrentUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  branch_id: number | null;
  team_id: number | null;
};

/** Resolves the logged-in user from the session cookie, or null. */
export async function currentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.branch_id, u.team_id, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND u.active = 1`,
    )
    .get(token) as (CurrentUser & { expires_at: number }) | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    destroySession(token);
    return null;
  }
  const { expires_at: _ignored, ...user } = row;
  return user;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Please sign in.");
  return user;
}

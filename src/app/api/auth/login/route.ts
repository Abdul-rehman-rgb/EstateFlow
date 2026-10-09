import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { api, readJson } from "@/lib/http";
import { ApiError, str } from "@/lib/util";
import { audit } from "@/lib/audit";

export const POST = api(
  async (req) => {
    const body = await readJson(req);
    const email = str(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) throw new ApiError(400, "Email and password are required.");
    const user = db().prepare("SELECT * FROM users WHERE email = ? AND active = 1").get(email) as
      | { id: number; password_hash: string; name: string; role: string; branch_id: number | null; team_id: number | null; email: string }
      | undefined;
    if (!user || !verifyPassword(password, user.password_hash)) {
      audit(null, "login_failed", "user", null, { email });
      throw new ApiError(401, "Incorrect email or password.");
    }
    const token = createSession(user.id);
    audit(user.id, "login", "user", user.id);
    const res = NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role, branch_id: user.branch_id, team_id: user.team_id });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  },
  { auth: false },
);

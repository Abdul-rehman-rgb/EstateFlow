import { NextResponse } from "next/server";
import { ApiError } from "./util";
import { requireUser, type CurrentUser } from "./auth";

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler: authenticates, maps ApiError to JSON status codes. */
export function api<P extends Record<string, string> = Record<string, string>>(
  handler: (req: Request, user: CurrentUser, params: P) => unknown | Promise<unknown>,
  opts: { auth?: boolean } = {},
) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      const params = (await ctx.params) ?? ({} as P);
      const user = opts.auth === false ? (null as unknown as CurrentUser) : await requireUser();
      const result = await handler(req, user, params);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message, ...(err.extra ? { details: err.extra } : {}) }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, any>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {
    /* fall through */
  }
  throw new ApiError(400, "Request body must be a JSON object.");
}

export function idParam(v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, "Invalid id.");
  return n;
}

export function csvResponse(filename: string, body: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

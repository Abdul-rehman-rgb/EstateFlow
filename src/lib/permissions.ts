import { ApiError } from "./util";
import type { CurrentUser } from "./auth";
export type { CurrentUser };

export const ROLES = ["super_admin", "owner", "branch_manager", "team_leader", "agent", "finance"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  owner: "Company Owner / Director",
  branch_manager: "Branch Manager",
  team_leader: "Team Leader",
  agent: "Real Estate Agent",
  finance: "Finance User",
};

const ALL_PERMS = "*";

const PERMISSIONS: Record<Role, string[] | typeof ALL_PERMS> = {
  super_admin: ALL_PERMS,
  owner: [
    "leads:write", "properties:write", "properties:approve", "viewings:write", "tasks:write",
    "tasks:escalate", "deals:write", "commission:approve", "reports:read", "audit:read",
    "import:write", "documents:write", "documents:sensitive", "export:write",
  ],
  branch_manager: [
    "leads:write", "properties:write", "properties:approve", "viewings:write", "tasks:write",
    "tasks:escalate", "deals:write", "reports:read", "import:write", "documents:write",
    "documents:sensitive", "export:write",
  ],
  team_leader: [
    "leads:write", "properties:write", "viewings:write", "tasks:write", "tasks:escalate",
    "deals:write", "reports:read", "documents:write",
  ],
  agent: ["leads:write", "properties:write", "viewings:write", "tasks:write", "deals:write", "documents:write"],
  finance: ["deals:read", "commission:approve", "reports:read", "export:write"],
};

export function can(user: CurrentUser, perm: string): boolean {
  const perms = PERMISSIONS[user.role as Role];
  if (!perms) return false;
  return perms === ALL_PERMS || perms.includes(perm);
}

export function requirePerm(user: CurrentUser, perm: string) {
  if (!can(user, perm)) throw new ApiError(403, "Your role does not allow this action.");
}

/**
 * Record scope by role:
 *  - all:    everything (super admin, owner, finance for approved deals only)
 *  - branch: everything in the user's branch (branch manager, and property inventory for others)
 *  - team:   records owned by the user or their team, plus unassigned branch records
 *  - own:    records owned by the user
 */
export function scopeOf(user: CurrentUser): "all" | "branch" | "team" | "own" {
  switch (user.role) {
    case "super_admin":
    case "owner":
    case "finance":
      return "all";
    case "branch_manager":
      return "branch";
    case "team_leader":
      return user.team_id ? "team" : "own";
    default:
      return "own";
  }
}

export type Clause = { sql: string; params: (string | number | null)[] };

/** Builds a visibility predicate for a table with an owner column and a branch column. */
export function ownerScope(
  user: CurrentUser,
  ownerCol: string,
  branchCol: string,
  opts: { unassignedVisible?: boolean } = {},
): Clause {
  switch (scopeOf(user)) {
    case "all":
      return { sql: "1=1", params: [] };
    case "branch":
      return { sql: `${branchCol} = ?`, params: [user.branch_id] };
    case "team": {
      const parts = [`${ownerCol} = ?`, `${ownerCol} IN (SELECT id FROM users WHERE team_id = ?)`];
      const params: (number | null)[] = [user.id, user.team_id];
      if (opts.unassignedVisible) {
        parts.push(`(${ownerCol} IS NULL AND ${branchCol} = ?)`);
        params.push(user.branch_id);
      }
      return { sql: `(${parts.join(" OR ")})`, params };
    }
    default:
      return { sql: `${ownerCol} = ?`, params: [user.id] };
  }
}

/** Properties are shared inventory: branch-wide for everyone except super admin and owner. */
export function inventoryScope(user: CurrentUser): Clause {
  const s = scopeOf(user);
  if (s === "all") return { sql: "1=1", params: [] };
  return { sql: "branch_id = ?", params: [user.branch_id] };
}

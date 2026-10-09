import { api } from "@/lib/http";
import { db } from "@/lib/db";
import { ROLE_LABELS, type Role } from "@/lib/permissions";

export const GET = api(async (_req, user) => {
  const branch = user.branch_id
    ? db().prepare("SELECT name FROM branches WHERE id = ?").get(user.branch_id) as { name: string } | undefined
    : undefined;
  return { ...user, role_label: ROLE_LABELS[user.role as Role], branch_name: branch?.name ?? null };
});

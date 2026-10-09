import { db } from "./db";
import { nowIso } from "./util";

/** Records an important change. Called inside the same transaction as the change. */
export async function audit(
  userId: number | null,
  action: string,
  entity: string,
  entityId: number | null,
  details?: Record<string, unknown>,
) {
  await db()
    .prepare("INSERT INTO audit_log (user_id, action, entity, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(userId, action, entity, entityId, details ? JSON.stringify(details) : null, nowIso());
}

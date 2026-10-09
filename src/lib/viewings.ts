import { db, Row } from "./db";
import { ApiError, nowIso, oneOf, str, int } from "./util";

export const VIEWING_MODES = ["in_person", "virtual"] as const;
export const VIEWING_OUTCOMES = ["interested", "not_interested", "follow_up_required"] as const;
export const VIEWING_STATUSES = ["scheduled", "completed", "cancelled", "no_show"] as const;

/** Parses a scheduled time into a normalised UTC ISO string (so string comparison is safe). */
export function parseWhen(v: unknown): string {
  const d = new Date(String(v ?? ""));
  if (Number.isNaN(d.getTime())) throw new ApiError(400, "scheduled_at must be a valid date and time.");
  return d.toISOString();
}

/** The agent's scheduled viewings that overlap the requested slot. */
export function findConflicts(agentId: number, startIso: string, durationMin: number, excludeId = 0): Row[] {
  const start = Date.parse(startIso);
  const end = start + durationMin * 60_000;
  const window = 24 * 3_600_000;
  const rows = db()
    .prepare(
      `SELECT v.*, l.name AS lead_name, p.ref AS property_ref FROM viewings v
       JOIN leads l ON l.id = v.lead_id JOIN properties p ON p.id = v.property_id
       WHERE v.agent_id = ? AND v.status = 'scheduled' AND v.id != ?
         AND v.scheduled_at >= ? AND v.scheduled_at <= ?`,
    )
    .all(agentId, excludeId, new Date(start - window).toISOString(), new Date(end + window).toISOString()) as Row[];
  return rows.filter((r) => {
    const s = Date.parse(r.scheduled_at);
    const e = s + r.duration_min * 60_000;
    return s < end && start < e;
  });
}

export function viewingInput(body: Row) {
  return {
    mode: oneOf(body.mode ?? "in_person", VIEWING_MODES, "viewing mode"),
    duration_min: int(body.duration_min) ?? 30,
    location: str(body.location),
    meeting_link: str(body.meeting_link),
  };
}

export const OUTCOME_LEAD_STATUS: Record<string, string> = {
  interested: "qualified",
  not_interested: "nurture",
};

import { db, tx } from "@/lib/db";
import { api, idParam, readJson } from "@/lib/http";
import { ApiError, int, nowIso, oneOf, str } from "@/lib/util";
import { requirePerm } from "@/lib/permissions";
import { ACTIVITY_KINDS, logActivity, visibleLead } from "@/lib/leads";

const RESPONSE_KINDS = ["call", "email", "whatsapp", "sms", "meeting"];

export const POST = api(async (req, user, p) => {
  requirePerm(user, "leads:write");
  const id = idParam(p.id);
  const lead = visibleLead(user, id);
  if (!lead) throw new ApiError(404, "Lead not found.");
  const body = await readJson(req);
  const kind = oneOf(body.kind ?? "note", ACTIVITY_KINDS, "activity type");
  const text = str(body.body);
  if (!text) throw new ApiError(400, "Activity notes cannot be empty.");
  tx(() => {
    logActivity({ leadId: id, kind, outcome: str(body.outcome), body: text, durationMin: int(body.duration_min), userId: user.id });
    if (RESPONSE_KINDS.includes(kind) && !lead.first_response_at) {
      db().prepare("UPDATE leads SET first_response_at = ? WHERE id = ?").run(nowIso(), id);
    }
    if (["new", "assigned"].includes(lead.status) && RESPONSE_KINDS.includes(kind)) {
      db().prepare("UPDATE leads SET status = 'contacted', updated_at = ? WHERE id = ?").run(nowIso(), id);
      logActivity({ leadId: id, kind: "status_change", userId: user.id, body: `Status: ${lead.status} → contacted` });
    }
  });
  return { ok: true };
});

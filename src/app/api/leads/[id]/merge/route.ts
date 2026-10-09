import { api, idParam, readJson } from "@/lib/http";
import { ApiError, int } from "@/lib/util";
import { requirePerm } from "@/lib/permissions";
import { mergeLeads, visibleLead } from "@/lib/leads";
import { tx } from "@/lib/db";

export const POST = api(async (req, user, p) => {
  requirePerm(user, "leads:write");
  const targetId = idParam(p.id);
  const body = await readJson(req);
  const sourceId = int(body.source_id);
  if (!sourceId) throw new ApiError(400, "source_id is required.");
  if (!visibleLead(user, targetId) || !visibleLead(user, sourceId)) throw new ApiError(404, "Lead not found.");
  tx(() => mergeLeads(user, targetId, sourceId));
  return { ok: true };
});

import { api, idParam } from "@/lib/http";
import { ApiError } from "@/lib/util";
import { requirePerm } from "@/lib/permissions";
import { matchProperties, visibleLead } from "@/lib/leads";

export const GET = api(async (_req, user, p) => {
  requirePerm(user, "leads:write");
  const lead = visibleLead(user, idParam(p.id));
  if (!lead) throw new ApiError(404, "Lead not found.");
  return { matches: matchProperties(lead, user) };
});

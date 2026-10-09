import { ApiError, int } from "@/lib/util";
import { api, readJson } from "@/lib/http";
import { requirePerm } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { setSetting, settings, tx } from "@/lib/db";

export const GET = api(async (_req, user) => {
  requirePerm(user, "users:manage");
  return settings();
});

export const PATCH = api(async (req, user) => {
  requirePerm(user, "users:manage");
  const body = await readJson(req);
  const current = settings();
  const changed: Record<string, unknown> = {};
  tx(() => {
    if (body.assignment_mode !== undefined) {
      if (!["manual", "round_robin", "workload"].includes(body.assignment_mode)) throw new ApiError(400, "Invalid assignment mode.");
      setSetting("assignment_mode", body.assignment_mode); changed.assignment_mode = body.assignment_mode;
    }
    if (body.sla_first_response_hours !== undefined) {
      const v = int(body.sla_first_response_hours);
      if (!v || v < 1) throw new ApiError(400, "SLA must be at least 1 hour.");
      setSetting("sla_first_response_hours", String(v)); changed.sla_first_response_hours = v;
    }
    if (body.listing_validity_days !== undefined) {
      const v = int(body.listing_validity_days);
      if (!v || v < 1) throw new ApiError(400, "Listing validity must be at least 1 day.");
      setSetting("listing_validity_days", String(v)); changed.listing_validity_days = v;
    }
    if (Array.isArray(body.lead_stages)) {
      const stages = body.lead_stages.map((s: unknown) => String(s).trim()).filter(Boolean);
      for (const required of ["new", "won", "lost"]) {
        if (!stages.includes(required)) throw new ApiError(400, `Lead stages must include "${required}".`);
      }
      setSetting("lead_stages", JSON.stringify(stages)); changed.lead_stages = stages;
    }
    if (Array.isArray(body.lost_reasons)) {
      const reasons = body.lost_reasons.map((s: unknown) => String(s).trim()).filter(Boolean);
      if (!reasons.length) throw new ApiError(400, "Provide at least one lost reason.");
      setSetting("lost_reasons", JSON.stringify(reasons)); changed.lost_reasons = reasons;
    }
    audit(user.id, "update", "settings", null, { changed, previous_mode: current.assignment_mode });
  });
  return settings();
});

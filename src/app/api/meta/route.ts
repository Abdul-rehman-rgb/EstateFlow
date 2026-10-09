import { db, settings } from "@/lib/db";
import { api } from "@/lib/http";
import { can, ROLE_LABELS, type Role } from "@/lib/permissions";
import { LEAD_SOURCES, PURPOSES, TIMELINES, PROPERTY_CATEGORIES } from "@/lib/leads";
import { PROPERTY_STATUSES, LISTING_TYPES, SALE_MODES } from "@/lib/properties";
import { DEAL_STAGES, DEAL_TYPES, OFFER_STATUSES } from "@/lib/deals";
import { VIEWING_MODES, VIEWING_OUTCOMES } from "@/lib/viewings";
import { DOCUMENT_KINDS } from "@/lib/documents";
import { PRIORITIES } from "@/lib/tasks";

/** Lookups the UI needs: enums, branches, teams and active users (names only). */
export const GET = api(async (_req, user) => ({
  me: { id: user.id, name: user.name, role: user.role, role_label: ROLE_LABELS[user.role as Role], branch_id: user.branch_id, team_id: user.team_id },
  can: {
    leads: can(user, "leads:write"), properties: can(user, "properties:write"), approve: can(user, "properties:approve"),
    viewings: can(user, "viewings:write"), tasks: can(user, "tasks:write"), escalate: can(user, "tasks:escalate"),
    deals: can(user, "deals:read") || can(user, "deals:write"), deal_write: can(user, "deals:write"),
    commission: can(user, "commission:approve"), reports: can(user, "reports:read"), export: can(user, "export:write"),
    import: can(user, "import:write"), audit: can(user, "audit:read"), admin: can(user, "users:manage"),
    documents_write: can(user, "documents:write"), sensitive: can(user, "documents:sensitive"),
  },
  enums: {
    lead_sources: LEAD_SOURCES, lead_purposes: PURPOSES, timelines: TIMELINES, categories: PROPERTY_CATEGORIES,
    property_statuses: PROPERTY_STATUSES, listing_types: LISTING_TYPES, sale_modes: SALE_MODES,
    deal_stages: DEAL_STAGES, deal_types: DEAL_TYPES, offer_statuses: OFFER_STATUSES,
    viewing_modes: VIEWING_MODES, viewing_outcomes: VIEWING_OUTCOMES, document_kinds: DOCUMENT_KINDS,
    priorities: PRIORITIES,
  },
  settings: settings(),
  branches: db().prepare("SELECT * FROM branches ORDER BY name").all(),
  teams: db().prepare("SELECT * FROM teams ORDER BY name").all(),
  users: db().prepare("SELECT id, name, role, branch_id, team_id FROM users WHERE active = 1 ORDER BY name").all(),
}));

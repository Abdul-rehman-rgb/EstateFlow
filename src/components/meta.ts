"use client";
import { api } from "@/lib/client";

export type Meta = {
  me: { id: number; name: string; role: string; role_label: string; branch_id: number | null; team_id: number | null };
  can: Record<string, boolean>;
  enums: Record<string, string[]>;
  settings: { assignment_mode: string; sla_first_response_hours: number; listing_validity_days: number; lead_stages: string[]; lost_reasons: string[] };
  branches: { id: number; name: string; emirate: string }[];
  teams: { id: number; name: string; branch_id: number; leader_id: number | null }[];
  users: { id: number; name: string; role: string; branch_id: number | null; team_id: number | null }[];
};

let cache: Promise<Meta> | null = null;
/** Loads lookups once per page session. Call `refreshMeta()` after admin changes. */
export function getMeta(): Promise<Meta> {
  if (!cache) cache = api<Meta>("/meta").catch((e) => { cache = null; throw e; });
  return cache;
}
export function refreshMeta() {
  cache = null;
  return getMeta();
}

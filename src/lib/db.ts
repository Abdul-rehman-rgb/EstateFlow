import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Row = Record<string, any>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  emirate TEXT NOT NULL DEFAULT 'Dubai'
);
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  leader_id INTEGER
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  branch_id INTEGER REFERENCES branches(id),
  team_id INTEGER REFERENCES teams(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  branch_id INTEGER REFERENCES branches(id),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'residential',
  listing_type TEXT NOT NULL DEFAULT 'sale',
  sale_mode TEXT NOT NULL DEFAULT 'secondary',
  status TEXT NOT NULL DEFAULT 'draft',
  price REAL,
  currency TEXT NOT NULL DEFAULT 'AED',
  size_sqft REAL,
  bedrooms INTEGER,
  bathrooms INTEGER,
  floor TEXT,
  view TEXT,
  amenities TEXT,
  emirate TEXT,
  location TEXT,
  owner_name TEXT,
  owner_phone TEXT,
  owner_instructions TEXT,
  agreed_price REAL,
  exclusive INTEGER NOT NULL DEFAULT 0,
  permit_number TEXT,
  permit_expiry TEXT,
  listing_expires_at TEXT,
  listed_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER REFERENCES branches(id),
  name TEXT NOT NULL,
  phone TEXT,
  phone_norm TEXT,
  email TEXT,
  email_norm TEXT,
  language TEXT NOT NULL DEFAULT 'English',
  nationality TEXT,
  purpose TEXT NOT NULL DEFAULT 'buy',
  property_type TEXT,
  preferred_area TEXT,
  budget_min REAL,
  budget_max REAL,
  bedrooms INTEGER,
  timeline TEXT,
  source TEXT,
  campaign TEXT,
  portal_ref TEXT,
  property_id INTEGER REFERENCES properties(id),
  status TEXT NOT NULL DEFAULT 'new',
  assigned_to INTEGER REFERENCES users(id),
  first_response_at TEXT,
  lost_reason TEXT,
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  opted_out INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_norm);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email_norm);
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  lead_id INTEGER REFERENCES leads(id),
  property_id INTEGER REFERENCES properties(id),
  branch_id INTEGER REFERENCES branches(id),
  agent_id INTEGER REFERENCES users(id),
  deal_type TEXT NOT NULL DEFAULT 'sale',
  stage TEXT NOT NULL DEFAULT 'offer_submitted',
  deal_value REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'AED',
  commission_percent REAL NOT NULL DEFAULT 2,
  commission_amount REAL NOT NULL DEFAULT 0,
  commission_status TEXT NOT NULL DEFAULT 'pending',
  commission_approved_by INTEGER REFERENCES users(id),
  reservation_amount REAL,
  reservation_expires_at TEXT,
  expected_close_date TEXT,
  lost_reason TEXT,
  closed_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id),
  amount REAL NOT NULL,
  counter_amount REAL,
  terms TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  buyer_party TEXT,
  seller_party TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS viewings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id),
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  agent_id INTEGER REFERENCES users(id),
  branch_id INTEGER REFERENCES branches(id),
  scheduled_at TEXT NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 30,
  mode TEXT NOT NULL DEFAULT 'in_person',
  location TEXT,
  meeting_link TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  outcome TEXT,
  feedback TEXT,
  objections TEXT,
  next_steps TEXT,
  rescheduled_to INTEGER REFERENCES viewings(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_viewings_agent ON viewings(agent_id, scheduled_at);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  lead_id INTEGER REFERENCES leads(id),
  property_id INTEGER REFERENCES properties(id),
  deal_id INTEGER REFERENCES deals(id),
  branch_id INTEGER REFERENCES branches(id),
  assigned_to INTEGER NOT NULL REFERENCES users(id),
  escalated_to INTEGER REFERENCES users(id),
  due_at TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  completed_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assigned_to, status);
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER REFERENCES leads(id),
  property_id INTEGER REFERENCES properties(id),
  deal_id INTEGER REFERENCES deals(id),
  kind TEXT NOT NULL,
  outcome TEXT,
  body TEXT,
  duration_min INTEGER,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id, created_at);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER REFERENCES leads(id),
  property_id INTEGER REFERENCES properties(id),
  deal_id INTEGER REFERENCES deals(id),
  kind TEXT NOT NULL DEFAULT 'document',
  title TEXT NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT,
  size INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT,
  sensitive INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
`;

const DEFAULT_SETTINGS: Record<string, string> = {
  assignment_mode: "round_robin", // manual | round_robin | workload
  sla_first_response_hours: "1",
  listing_validity_days: "90",
  lead_stages: JSON.stringify([
    "new", "assigned", "contacted", "qualified", "viewing_scheduled",
    "offer_submitted", "won", "lost", "nurture",
  ]),
  lost_reasons: JSON.stringify([
    "Budget", "Timing", "Property mismatch", "Competitor", "Unresponsive lead", "Other",
  ]),
};

function open(file: string): DatabaseSync {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON;");
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  const ins = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
  return db;
}

// One connection per server process; survives Next.js dev hot-reloads.
const g = globalThis as unknown as { __crmDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!g.__crmDb) {
    const file = process.env.CRM_DB_PATH ?? path.join(process.cwd(), "data", "crm.db");
    g.__crmDb = open(file);
  }
  return g.__crmDb;
}

/** Open a fresh, isolated database (used by tests). */
export function openDb(file: string): DatabaseSync {
  return open(file);
}

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const result = fn();
    d.exec("COMMIT");
    return result;
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }
}

export function setting(key: string): string {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as Row | undefined;
  return row?.value ?? DEFAULT_SETTINGS[key];
}

export function setSetting(key: string, value: string) {
  db().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function settings() {
  return {
    assignment_mode: setting("assignment_mode"),
    sla_first_response_hours: Number(setting("sla_first_response_hours")),
    listing_validity_days: Number(setting("listing_validity_days")),
    lead_stages: JSON.parse(setting("lead_stages")) as string[],
    lost_reasons: JSON.parse(setting("lost_reasons")) as string[],
  };
}

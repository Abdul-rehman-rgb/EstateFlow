import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";

export type Row = Record<string, any>;
type Param = string | number | null | Buffer;

// COUNT/SUM over integers come back as int8/numeric; the app treats them as plain numbers.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  emirate TEXT NOT NULL DEFAULT 'Dubai'
);
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  leader_id INTEGER
);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  branch_id INTEGER REFERENCES branches(id),
  team_id INTEGER REFERENCES teams(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (lower(email));
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS properties (
  id SERIAL PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  branch_id INTEGER REFERENCES branches(id),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'residential',
  listing_type TEXT NOT NULL DEFAULT 'sale',
  sale_mode TEXT NOT NULL DEFAULT 'secondary',
  status TEXT NOT NULL DEFAULT 'draft',
  price DOUBLE PRECISION,
  currency TEXT NOT NULL DEFAULT 'AED',
  size_sqft DOUBLE PRECISION,
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
  agreed_price DOUBLE PRECISION,
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
  id SERIAL PRIMARY KEY,
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
  budget_min DOUBLE PRECISION,
  budget_max DOUBLE PRECISION,
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
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  lead_id INTEGER REFERENCES leads(id),
  property_id INTEGER REFERENCES properties(id),
  branch_id INTEGER REFERENCES branches(id),
  agent_id INTEGER REFERENCES users(id),
  deal_type TEXT NOT NULL DEFAULT 'sale',
  stage TEXT NOT NULL DEFAULT 'offer_submitted',
  deal_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'AED',
  commission_percent DOUBLE PRECISION NOT NULL DEFAULT 2,
  commission_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  commission_status TEXT NOT NULL DEFAULT 'pending',
  commission_approved_by INTEGER REFERENCES users(id),
  reservation_amount DOUBLE PRECISION,
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
  id SERIAL PRIMARY KEY,
  deal_id INTEGER NOT NULL REFERENCES deals(id),
  amount DOUBLE PRECISION NOT NULL,
  counter_amount DOUBLE PRECISION,
  terms TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  buyer_party TEXT,
  seller_party TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS viewings (
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
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
  id SERIAL PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS document_files (
  stored_name TEXT PRIMARY KEY,
  data BYTEA NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
`;

/** Tables without a serial `id`; inserts into these do not report lastInsertRowid. */
const NO_ID_TABLES = new Set(["settings", "sessions", "document_files"]);

export const ALL_TABLES = [
  "document_files", "documents", "audit_log", "activities", "tasks", "viewings", "offers", "deals", "leads",
  "properties", "sessions", "users", "teams", "branches", "settings",
];

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

type Client = pg.Pool | pg.PoolClient;

// One pool per server process; survives Next.js dev hot-reloads.
const g = globalThis as unknown as { __crmPool?: pg.Pool; __crmReady?: Promise<void> };
const txStore = new AsyncLocalStorage<pg.PoolClient>();

function pool(): pg.Pool {
  if (!g.__crmPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set.");
    g.__crmPool = new pg.Pool({ connectionString, max: Number(process.env.PG_POOL_MAX ?? 5), idleTimeoutMillis: 10_000 });
  }
  return g.__crmPool;
}

/** Creates tables and default settings once per process. Concurrent cold starts serialise on an advisory lock. */
export function ensureSchema(): Promise<void> {
  if (!g.__crmReady) {
    g.__crmReady = (async () => {
      const c = await pool().connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT pg_advisory_xact_lock(727274)");
        await c.query(SCHEMA);
        for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
          await c.query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING", [k, v]);
        }
        await c.query("COMMIT");
      } catch (err) {
        await c.query("ROLLBACK").catch(() => undefined);
        g.__crmReady = undefined;
        throw err;
      } finally {
        c.release();
      }
    })();
  }
  return g.__crmReady;
}

/** Rewrites `?` placeholders (outside quoted literals) to `$1, $2, …`. */
function toPg(sql: string): string {
  let n = 0;
  let out = "";
  let quote: string | null = null;
  for (const ch of sql) {
    if (quote) {
      if (ch === quote) quote = null;
      out += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
    } else if (ch === "?") {
      out += `$${++n}`;
    } else out += ch;
  }
  return out;
}

async function exec(sql: string, params: Param[]) {
  await ensureSchema();
  const client: Client = txStore.getStore() ?? pool();
  return client.query(toPg(sql), params);
}

class Statement {
  constructor(private sql: string) {}

  async get(...params: Param[]): Promise<Row | undefined> {
    return (await exec(this.sql, params)).rows[0];
  }

  async all(...params: Param[]): Promise<Row[]> {
    return (await exec(this.sql, params)).rows;
  }

  /** Mirrors the SQLite result shape: rows changed, and the new id for inserts into id tables. */
  async run(...params: Param[]): Promise<{ changes: number; lastInsertRowid: number }> {
    let sql = this.sql;
    const insert = /^\s*INSERT\s+INTO\s+(\w+)/i.exec(sql);
    const wantsId = insert && !NO_ID_TABLES.has(insert[1].toLowerCase()) && !/\bRETURNING\b/i.test(sql);
    if (wantsId) sql = `${sql} RETURNING id`;
    const res = await exec(sql, params);
    return { changes: res.rowCount ?? 0, lastInsertRowid: wantsId ? Number(res.rows[0]?.id) : 0 };
  }
}

export function db() {
  return { prepare: (sql: string) => new Statement(sql) };
}

/** Runs `fn` in a transaction; every db() call inside it uses the same connection. Nested calls join the outer one. */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn();
  await ensureSchema();
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await txStore.run(client, fn);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Drops every table (used by `seed --reset` and tests). */
export async function dropAll() {
  await pool().query(`DROP TABLE IF EXISTS ${ALL_TABLES.join(", ")} CASCADE`);
  g.__crmReady = undefined;
}

export async function closeDb() {
  await g.__crmPool?.end();
  g.__crmPool = undefined;
  g.__crmReady = undefined;
}

export async function setting(key: string): Promise<string> {
  const row = await db().prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value ?? DEFAULT_SETTINGS[key];
}

export async function setSetting(key: string, value: string) {
  await db().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export async function settings() {
  const rows = await db().prepare("SELECT key, value FROM settings").all();
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? DEFAULT_SETTINGS[k];
  return {
    assignment_mode: get("assignment_mode"),
    sla_first_response_hours: Number(get("sla_first_response_hours")),
    listing_validity_days: Number(get("listing_validity_days")),
    lead_stages: JSON.parse(get("lead_stages")) as string[],
    lost_reasons: JSON.parse(get("lost_reasons")) as string[],
  };
}

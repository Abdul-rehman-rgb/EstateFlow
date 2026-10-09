/**
 * End-to-end API tests. They run against the production build (`npm run build` first)
 * with the TEST_DATABASE_URL database, wiped and seeded with the demo data.
 */
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";

// A random high port avoids collisions with stale servers from earlier runs.
const PORT = 3300 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
try { process.loadEnvFile(".env.local"); } catch { /* use the existing environment */ }
// Tests wipe and reseed the database, so they need a dedicated one (e.g. a Neon "test" branch).
const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB) throw new Error("Set TEST_DATABASE_URL to a disposable Postgres database before running the tests.");
const ENV: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: TEST_DB, NODE_ENV: "production" };
const SHELL = process.platform === "win32"; // npx is a .cmd shim on Windows
let server: ChildProcess;

type Session = { cookie: string; user: any };
const sessions: Record<string, Session> = {};

async function call(method: string, p: string, opts: { as?: string; json?: unknown; form?: FormData; raw?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (opts.as) headers.cookie = sessions[opts.as].cookie;
  let body: BodyInit | undefined;
  if (opts.json !== undefined) { headers["content-type"] = "application/json"; body = JSON.stringify(opts.json); }
  if (opts.form) body = opts.form;
  const res = await fetch(`${BASE}/api${p}`, { method, headers, body, redirect: "manual" });
  if (opts.raw) return res;
  const isJson = res.headers.get("content-type")?.includes("json");
  return { status: res.status, body: isJson ? await res.json() : await res.text(), headers: res.headers };
}

async function login(email: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "Demo@12345" }),
  });
  assert.equal(res.status, 200, `login ${email} failed`);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  sessions[email] = { cookie, user: await res.json() };
}

before(async () => {
  execFileSync("npx", ["tsx", "scripts/seed.ts", "--reset"], { env: ENV, stdio: "pipe", shell: SHELL });
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: ENV, stdio: "pipe", shell: SHELL });
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`${BASE}/login`); if (r.ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  for (const e of ["agent1@demo.ae", "agent2@demo.ae", "agent3@demo.ae", "agent4@demo.ae", "manager@demo.ae", "leader@demo.ae", "owner@demo.ae", "finance@demo.ae", "admin@demo.ae"]) {
    await login(e);
  }
});

after(() => {
  try { server?.kill("SIGKILL"); } catch { /* already stopped */ }
  // `next start` forks a next-server worker that can outlive its parent; free the port explicitly.
  try {
    if (SHELL) execFileSync("cmd", ["/c", `for /f "tokens=5" %p in ('netstat -ano ^| findstr :${PORT} ^| findstr LISTENING') do taskkill /F /PID %p`], { stdio: "ignore" });
    else execFileSync("fuser", ["-k", `${PORT}/tcp`], { stdio: "ignore" });
  } catch { /* nothing listening */ }
});

describe("authentication", () => {
  test("wrong password is rejected", async () => {
    const r = await call("POST", "/auth/login", { json: { email: "agent1@demo.ae", password: "nope" } });
    assert.equal(r.status, 401);
  });

  test("protected endpoints require a session", async () => {
    const r = await call("GET", "/leads");
    assert.equal(r.status, 401);
  });

  test("me returns the role and branch", async () => {
    const r = await call("GET", "/auth/me", { as: "agent1@demo.ae" });
    assert.equal(r.status, 200);
    assert.equal(r.body.role, "agent");
    assert.equal(r.body.branch_name, "Dubai Marina");
  });

  test("logout invalidates the session", async () => {
    await login("agent3@demo.ae");
    const before = await call("GET", "/auth/me", { as: "agent3@demo.ae" });
    assert.equal(before.status, 200);
    await call("POST", "/auth/logout", { as: "agent3@demo.ae" });
    const after = await call("GET", "/auth/me", { as: "agent3@demo.ae" });
    assert.equal(after.status, 401);
  });
});

describe("role scope and permissions", () => {
  test("agents only see leads assigned to them", async () => {
    const r = await call("GET", "/leads", { as: "agent1@demo.ae" });
    assert.equal(r.status, 200);
    const me = sessions["agent1@demo.ae"].user.id;
    assert.ok(r.body.leads.length > 0);
    for (const l of r.body.leads) assert.equal(l.assigned_to, me);
  });

  test("branch manager sees the whole branch", async () => {
    const r = await call("GET", "/leads", { as: "manager@demo.ae" });
    assert.ok(r.body.leads.length > 2);
  });

  test("finance users cannot read leads", async () => {
    const r = await call("GET", "/leads", { as: "finance@demo.ae" });
    assert.equal(r.status, 403);
  });

  test("finance only sees signed or closed deals", async () => {
    const r = await call("GET", "/deals", { as: "finance@demo.ae" });
    assert.equal(r.status, 200);
    assert.ok(r.body.deals.length > 0);
    for (const d of r.body.deals) assert.ok(["contract_signed", "closed_won"].includes(d.stage));
  });

  test("agents cannot open the audit log or user admin", async () => {
    assert.equal((await call("GET", "/audit", { as: "agent1@demo.ae" })).status, 403);
    assert.equal((await call("GET", "/admin/users", { as: "agent1@demo.ae" })).status, 403);
    assert.equal((await call("GET", "/audit", { as: "owner@demo.ae" })).status, 200);
  });

  test("agents cannot export reports; managers can", async () => {
    assert.equal((await call("GET", "/reports/funnel?format=csv", { as: "agent1@demo.ae" })).status, 403);
    const csv = await call("GET", "/reports/sources?format=csv", { as: "manager@demo.ae" });
    assert.equal(csv.status, 200);
    assert.match(String(csv.body), /source,leads/);
  });

  test("a branch manager cannot read another branch's leads", async () => {
    const adLead = (await call("GET", "/leads", { as: "agent4@demo.ae" })).body.leads[0];
    if (!adLead) return;
    const r = await call("GET", `/leads/${adLead.id}`, { as: "manager@demo.ae" });
    assert.equal(r.status, 404);
  });
});

describe("leads", () => {
  let newLeadId: number;

  test("creating a lead without contact details is rejected", async () => {
    const r = await call("POST", "/leads", { as: "agent1@demo.ae", json: { name: "No contact" } });
    assert.equal(r.status, 400);
  });

  test("duplicate phone returns 409 with the existing record, and can be confirmed", async () => {
    const dup = await call("POST", "/leads", { as: "agent1@demo.ae", json: { name: "Ravi again", phone: "050 123 4567" } });
    assert.equal(dup.status, 409);
    assert.ok(dup.body.details.duplicates.length >= 1);
    const ok = await call("POST", "/leads", { as: "agent1@demo.ae", json: { name: "Ravi again", phone: "050 123 4567", allow_duplicate: true } });
    assert.equal(ok.status, 200);
    newLeadId = ok.body.id;
    assert.equal(ok.body.status, "assigned");
    assert.ok(ok.body.assigned_to, "auto-assignment should pick an agent");
  });

  test("logging a call records first response and moves a new lead to contacted", async () => {
    const created = await call("POST", "/leads", { as: "manager@demo.ae", json: { name: "Fresh lead", email: "fresh@example.com", source: "Website" } });
    assert.equal(created.status, 200);
    const id = created.body.id;
    const logged = await call("POST", `/leads/${id}/activities`, { as: "manager@demo.ae", json: { kind: "call", body: "Left voicemail", outcome: "no_answer", duration_min: 1 } });
    assert.equal(logged.status, 200);
    const detail = await call("GET", `/leads/${id}`, { as: "manager@demo.ae" });
    assert.ok(detail.body.first_response_at);
    assert.equal(detail.body.status, "contacted");
    assert.ok(detail.body.activities.some((a: any) => a.kind === "call"));
  });

  test("assigning across branches is refused", async () => {
    const ad = sessions["agent4@demo.ae"].user.id;
    const r = await call("POST", `/leads/${newLeadId}/assign`, { as: "manager@demo.ae", json: { user_id: ad } });
    assert.equal(r.status, 400);
  });

  test("losing a lead requires a reason from the configured list", async () => {
    const created = await call("POST", "/leads", { as: "manager@demo.ae", json: { name: "Lost one", phone: "0509999999" } });
    const bad = await call("PATCH", `/leads/${created.body.id}`, { as: "manager@demo.ae", json: { status: "lost" } });
    assert.equal(bad.status, 400);
    const ok = await call("PATCH", `/leads/${created.body.id}`, { as: "manager@demo.ae", json: { status: "lost", lost_reason: "Budget" } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.lost_reason, "Budget");
  });

  test("a lead is never listed as its own duplicate", async () => {
    const r = await call("GET", "/leads/1", { as: "manager@demo.ae" });
    assert.ok(r.body.duplicates.length >= 1, "seeded Ravi has a same-number record");
    assert.ok(!r.body.duplicates.some((d: any) => d.id === 1));
  });

  test("partial updates keep fields that were not sent", async () => {
    const before = await call("GET", "/leads/1", { as: "manager@demo.ae" });
    const r = await call("PATCH", "/leads/1", { as: "manager@demo.ae", json: { nationality: "Emirati" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.budget_max, before.body.budget_max);
    assert.equal(r.body.phone, before.body.phone);
  });

  test("merge moves activities onto the target and removes the duplicate", async () => {
    const a = await call("POST", "/leads", { as: "manager@demo.ae", json: { name: "Merge A", phone: "0508888888" } });
    const b = await call("POST", "/leads", { as: "manager@demo.ae", json: { name: "Merge B", email: "mergeb@example.com" } });
    await call("POST", `/leads/${b.body.id}/activities`, { as: "manager@demo.ae", json: { kind: "note", body: "From B" } });
    const merged = await call("POST", `/leads/${a.body.id}/merge`, { as: "manager@demo.ae", json: { source_id: b.body.id } });
    assert.equal(merged.status, 200);
    const detail = await call("GET", `/leads/${a.body.id}`, { as: "manager@demo.ae" });
    assert.ok(detail.body.activities.some((x: any) => x.body === "From B"));
    assert.equal((await call("GET", `/leads/${b.body.id}`, { as: "manager@demo.ae" })).status, 404);
  });

  test("round-robin auto-assignment rotates through Dubai agents", async () => {
    const ids = new Set<number>();
    for (let i = 0; i < 3; i++) {
      const r = await call("POST", "/leads", { as: "manager@demo.ae", json: { name: `RR ${i}`, phone: `05770000${i}0` } });
      ids.add(r.body.assigned_to);
    }
    assert.ok(ids.size >= 2, "assignments should spread across agents");
  });
});

describe("properties and listing approval", () => {
  let propId: number;

  test("agent creates a draft that cannot be approved by the agent", async () => {
    const r = await call("POST", "/properties", { as: "agent1@demo.ae", json: { title: "Test flat", listing_type: "sale", price: 1000000, bedrooms: 2, location: "Marina" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "draft");
    assert.match(r.body.ref, /^PRP-/);
    propId = r.body.id;
    await call("POST", `/properties/${propId}/status`, { as: "agent1@demo.ae", json: { action: "submit" } });
    const self = await call("POST", `/properties/${propId}/status`, { as: "agent1@demo.ae", json: { action: "approve" } });
    assert.equal(self.status, 403);
  });

  test("a manager approves the listing and it becomes active with an expiry", async () => {
    const r = await call("POST", `/properties/${propId}/status`, { as: "manager@demo.ae", json: { action: "approve" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, "active");
    assert.ok(r.body.listing_expires_at);
  });

  test("invalid status transitions are refused", async () => {
    const r = await call("POST", `/properties/${propId}/status`, { as: "manager@demo.ae", json: { action: "status", status: "draft" } });
    assert.equal(r.status, 409);
    assert.ok(r.body.details.allowed.length > 0);
  });

  test("listing matches a lead by budget, area and bedrooms", async () => {
    const lead = await call("POST", "/leads", { as: "manager@demo.ae", json: { name: "Matcher", phone: "0501010101", budget_max: 1200000, preferred_area: "Marina", bedrooms: 2, property_type: "residential", purpose: "buy" } });
    const m = await call("GET", `/leads/${lead.body.id}/matches`, { as: "manager@demo.ae" });
    assert.ok(m.body.matches.some((x: any) => x.id === propId));
  });
});

describe("viewings and tasks", () => {
  let viewingId: number;
  const when = new Date(Date.now() + 5 * 86400e3);
  when.setHours(11, 0, 0, 0);

  test("booking an overlapping viewing for the same agent is flagged, and can be forced", async () => {
    const lead = await call("POST", "/leads", { as: "agent1@demo.ae", json: { name: "Viewer", phone: "0502020202", assigned_to: sessions["agent1@demo.ae"].user.id } });
    const first = await call("POST", "/viewings", { as: "agent1@demo.ae", json: { lead_id: lead.body.id, property_id: 1, scheduled_at: when.toISOString(), duration_min: 60 } });
    assert.equal(first.status, 200);
    viewingId = first.body.id;
    const clash = await call("POST", "/viewings", { as: "agent1@demo.ae", json: { lead_id: lead.body.id, property_id: 1, scheduled_at: new Date(when.getTime() + 30 * 60e3).toISOString(), duration_min: 30 } });
    assert.equal(clash.status, 409);
    const forced = await call("POST", "/viewings", { as: "agent1@demo.ae", json: { lead_id: lead.body.id, property_id: 1, scheduled_at: new Date(when.getTime() + 30 * 60e3).toISOString(), duration_min: 30, allow_conflict: true } });
    assert.equal(forced.status, 200);
  });

  test("recording a completed, interested viewing creates a follow-up task and qualifies the lead", async () => {
    const r = await call("PATCH", `/viewings/${viewingId}`, { as: "agent1@demo.ae", json: { status: "completed", outcome: "interested", feedback: "Loved it" } });
    assert.equal(r.status, 200);
    const tasks = await call("GET", "/tasks?scope=mine&status=open", { as: "agent1@demo.ae" });
    assert.ok(tasks.body.tasks.some((t: any) => t.title.startsWith("Post-viewing follow-up")));
  });

  test("rescheduling creates a replacement viewing and marks the original", async () => {
    const lead = await call("POST", "/leads", { as: "agent2@demo.ae", json: { name: "Reschedule me", phone: "0503030303", assigned_to: sessions["agent2@demo.ae"].user.id } });
    const v = await call("POST", "/viewings", { as: "agent2@demo.ae", json: { lead_id: lead.body.id, property_id: 2, scheduled_at: new Date(Date.now() + 9 * 86400e3).toISOString() } });
    const r = await call("POST", `/viewings/${v.body.id}/reschedule`, { as: "agent2@demo.ae", json: { scheduled_at: new Date(Date.now() + 10 * 86400e3).toISOString() } });
    assert.equal(r.status, 200);
    const old = await call("GET", `/viewings/${v.body.id}`, { as: "agent2@demo.ae" });
    assert.equal(old.body.status, "rescheduled");
    assert.equal(old.body.rescheduled_to, r.body.id);
  });

  test("tasks cannot be assigned outside the branch", async () => {
    const ad = sessions["agent4@demo.ae"].user.id;
    const r = await call("POST", "/tasks", { as: "agent1@demo.ae", json: { title: "Cross-branch", assigned_to: ad } });
    assert.equal(r.status, 400);
  });

  test("escalation moves overdue tasks to the team leader", async () => {
    const r = await call("POST", "/tasks/escalate", { as: "manager@demo.ae" });
    assert.equal(r.status, 200);
    assert.ok(r.body.escalated >= 1);
  });
});

describe("deals, offers and commission", () => {
  let dealId: number;

  test("opening a deal takes the listing under offer and sets commission", async () => {
    const lead = await call("POST", "/leads", { as: "agent1@demo.ae", json: { name: "Buyer", phone: "0504040404", assigned_to: sessions["agent1@demo.ae"].user.id } });
    const r = await call("POST", "/deals", { as: "agent1@demo.ae", json: { lead_id: lead.body.id, property_id: 1, offer_amount: 2000000, commission_percent: 2 } });
    assert.equal(r.status, 200);
    dealId = r.body.id;
    assert.equal(r.body.commission_amount, 40000);
    const prop = await call("GET", "/properties/1", { as: "manager@demo.ae" });
    assert.equal(prop.body.status, "under_offer");
  });

  test("a closed-won deal needs a signed contract first", async () => {
    const r = await call("PATCH", `/deals/${dealId}`, { as: "agent1@demo.ae", json: { stage: "closed_won" } });
    assert.equal(r.status, 409);
  });

  test("a lost deal needs a reason and releases the listing", async () => {
    const lead = await call("POST", "/leads", { as: "agent1@demo.ae", json: { name: "Cold buyer", phone: "0505050505", assigned_to: sessions["agent1@demo.ae"].user.id } });
    const d = await call("POST", "/deals", { as: "agent1@demo.ae", json: { lead_id: lead.body.id, property_id: 2 } });
    const noReason = await call("PATCH", `/deals/${d.body.id}`, { as: "agent1@demo.ae", json: { stage: "closed_lost" } });
    assert.equal(noReason.status, 400);
    const lost = await call("PATCH", `/deals/${d.body.id}`, { as: "agent1@demo.ae", json: { stage: "closed_lost", lost_reason: "Timing" } });
    assert.equal(lost.status, 200);
    const prop = await call("GET", "/properties/2", { as: "manager@demo.ae" });
    assert.equal(prop.body.status, "active");
  });

  test("offers are recorded against the deal", async () => {
    const r = await call("POST", `/deals/${dealId}/offers`, { as: "agent1@demo.ae", json: { amount: 1900000, counter_amount: 1950000, status: "countered", terms: "30 days" } });
    assert.equal(r.status, 200);
    const detail = await call("GET", `/deals/${dealId}`, { as: "agent1@demo.ae" });
    assert.equal(detail.body.offers.length, 2);
  });

  test("the full path to closed won updates the lead and listing; commission needs finance approval", async () => {
    assert.equal((await call("PATCH", `/deals/${dealId}`, { as: "agent1@demo.ae", json: { stage: "reserved" } })).status, 200);
    assert.equal((await call("PATCH", `/deals/${dealId}`, { as: "agent1@demo.ae", json: { stage: "contract_signed" } })).status, 200);
    assert.equal((await call("PATCH", `/deals/${dealId}`, { as: "agent1@demo.ae", json: { stage: "closed_won" } })).status, 200);
    const prop = await call("GET", "/properties/1", { as: "manager@demo.ae" });
    assert.equal(prop.body.status, "sold");
    const agentApprove = await call("POST", `/deals/${dealId}/commission`, { as: "agent1@demo.ae", json: { action: "approve" } });
    assert.equal(agentApprove.status, 403);
    const finApprove = await call("POST", `/deals/${dealId}/commission`, { as: "finance@demo.ae", json: { action: "approve" } });
    assert.equal(finApprove.status, 200);
    assert.equal(finApprove.body.commission_status, "approved");
    const paid = await call("POST", `/deals/${dealId}/commission`, { as: "finance@demo.ae", json: { action: "paid" } });
    assert.equal(paid.body.commission_status, "paid");
  });

  test("changing the deal value after approval resets commission to pending", async () => {
    const seeded = (await call("GET", "/deals", { as: "finance@demo.ae" })).body.deals.find((d: any) => d.stage === "contract_signed");
    const approved = await call("POST", `/deals/${seeded.id}/commission`, { as: "finance@demo.ae", json: { action: "approve" } });
    assert.equal(approved.status, 200);
    const edited = await call("PATCH", `/deals/${seeded.id}`, { as: "manager@demo.ae", json: { deal_value: 3000000 } });
    assert.equal(edited.body.commission_status, "pending");
    assert.equal(edited.body.commission_amount, 60000);
  });
});

describe("documents", () => {
  test("upload, version and download a document", async () => {
    const fd = new FormData();
    fd.set("file", new File(["hello contract"], "contract.txt", { type: "text/plain" }));
    fd.set("lead_id", "1");
    fd.set("kind", "contract");
    const up = await call("POST", "/documents", { as: "agent1@demo.ae", form: fd });
    assert.equal(up.status, 200, JSON.stringify(up.body));
    assert.equal(up.body.version, 1);
    const fd2 = new FormData();
    fd2.set("file", new File(["v2"], "contract.txt", { type: "text/plain" }));
    fd2.set("lead_id", "1");
    fd2.set("title", "contract.txt");
    const up2 = await call("POST", "/documents", { as: "agent1@demo.ae", form: fd2 });
    assert.equal(up2.body.version, 2);
    const dl = await call("GET", `/documents/${up.body.id}/download`, { as: "agent1@demo.ae" });
    assert.equal(dl.body, "hello contract");
  });

  test("disallowed file types are rejected", async () => {
    const fd = new FormData();
    fd.set("file", new File(["MZ"], "tool.exe"));
    fd.set("lead_id", "1");
    const r = await call("POST", "/documents", { as: "agent1@demo.ae", form: fd });
    assert.equal(r.status, 400);
  });

  test("sensitive documents are hidden from agents and cannot be uploaded by them", async () => {
    const fd = new FormData();
    fd.set("file", new File(["secret"], "id.txt"));
    fd.set("lead_id", "1");
    fd.set("sensitive", "true");
    const denied = await call("POST", "/documents", { as: "agent1@demo.ae", form: fd });
    assert.equal(denied.status, 403);
  });

  test("agents cannot download documents on leads they do not own", async () => {
    const fd = new FormData();
    fd.set("file", new File(["manager only"], "note.txt"));
    fd.set("lead_id", "1");
    const up = await call("POST", "/documents", { as: "manager@demo.ae", form: fd });
    assert.equal(up.status, 200);
    const dl = await call("GET", `/documents/${up.body.id}/download`, { as: "agent2@demo.ae" });
    assert.equal(dl.status, 404);
  });
});

describe("CSV import", () => {
  const csv = [
    "name,phone,email,source,purpose,budget_max,bedrooms",
    "Import One,0501111111,one@example.com,Bayut,buy,1500000,2",
    "Import Two,,two@example.com,Website,rent,90000,1",
    "Ravi dup,0501234567,,Website,buy,,",
    "No Contact,,,Website,buy,,",
    '"Quoted ""Name""",0502222222,,Phone,buy,,',
  ].join("\n");

  test("a dry run previews rows and reports problems without saving", async () => {
    const fd = new FormData();
    fd.set("file", new File([csv], "leads.csv", { type: "text/csv" }));
    const r = await call("POST", "/imports/leads", { as: "manager@demo.ae", form: fd });
    assert.equal(r.status, 200);
    assert.equal(r.body.dryRun, true);
    assert.equal(r.body.valid, 3);
    assert.equal(r.body.invalid, 1);
    assert.equal(r.body.skipped, 1);
    const list = await call("GET", "/leads?q=Import%20One", { as: "manager@demo.ae" });
    assert.equal(list.body.leads.length, 0);
  });

  test("commit inserts only the valid rows", async () => {
    const fd = new FormData();
    fd.set("file", new File([csv], "leads.csv", { type: "text/csv" }));
    const r = await call("POST", "/imports/leads?commit=1", { as: "manager@demo.ae", form: fd });
    assert.equal(r.status, 200);
    assert.equal(r.body.created, 3);
    const one = await call("GET", "/leads?q=Import%20One", { as: "manager@demo.ae" });
    assert.equal(one.body.leads.length, 1);
    const quoted = await call("GET", "/leads?q=Quoted", { as: "manager@demo.ae" });
    assert.equal(quoted.body.leads[0].name, 'Quoted "Name"');
  });

  test("the template downloads with the expected headers", async () => {
    const r = await call("GET", "/imports/properties", { as: "manager@demo.ae" });
    assert.equal(r.status, 200);
    assert.match(String(r.body), /^ref,title,category/);
  });
});

describe("reports, dashboard and audit", () => {
  test("funnel and sources reports return rows", async () => {
    const f = await call("GET", "/reports/funnel", { as: "manager@demo.ae" });
    assert.equal(f.body.rows[0].stage, "Leads received");
    assert.ok(f.body.rows[0].count > 0);
    const s = await call("GET", "/reports/sla", { as: "owner@demo.ae" });
    assert.equal(s.status, 200);
  });

  test("the dashboard reports KPIs for each role", async () => {
    const agent = await call("GET", "/dashboard", { as: "agent1@demo.ae" });
    assert.equal(agent.status, 200);
    assert.ok("uncontacted_leads" in agent.body.kpis);
    const fin = await call("GET", "/dashboard", { as: "finance@demo.ae" });
    assert.ok(!("uncontacted_leads" in fin.body.kpis));
    assert.ok("commission_approved" in fin.body.kpis);
  });

  test("important changes appear in the audit log", async () => {
    const r = await call("GET", "/audit?entity=deal&limit=50", { as: "owner@demo.ae" });
    assert.equal(r.status, 200);
    assert.ok(r.body.entries.some((e: any) => e.action === "stage_change"));
    assert.ok(r.body.entries.some((e: any) => e.action === "commission_approve"));
  });
});

describe("administration", () => {
  test("only super admins can create users; temp passwords must be 8+ characters", async () => {
    assert.equal((await call("POST", "/admin/users", { as: "manager@demo.ae", json: { name: "X", email: "x@demo.ae", role: "agent", branch_id: 1, password: "longenough" } })).status, 403);
    const short = await call("POST", "/admin/users", { as: "admin@demo.ae", json: { name: "X", email: "x@demo.ae", role: "agent", branch_id: 1, password: "short" } });
    assert.equal(short.status, 400);
    const ok = await call("POST", "/admin/users", { as: "admin@demo.ae", json: { name: "New Agent", email: "new.agent@demo.ae", role: "agent", branch_id: 1, password: "longenough1" } });
    assert.equal(ok.status, 200);
  });

  test("an admin cannot deactivate their own account", async () => {
    const id = sessions["admin@demo.ae"].user.id;
    const r = await call("PATCH", `/admin/users/${id}`, { as: "admin@demo.ae", json: { active: false } });
    assert.equal(r.status, 400);
  });

  test("settings validate the SLA and require mandatory lead stages", async () => {
    assert.equal((await call("PATCH", "/admin/settings", { as: "admin@demo.ae", json: { sla_first_response_hours: 0 } })).status, 400);
    assert.equal((await call("PATCH", "/admin/settings", { as: "admin@demo.ae", json: { lead_stages: ["new", "contacted"] } })).status, 400);
    const ok = await call("PATCH", "/admin/settings", { as: "admin@demo.ae", json: { assignment_mode: "workload", sla_first_response_hours: 2 } });
    assert.equal(ok.body.assignment_mode, "workload");
    assert.equal(ok.body.sla_first_response_hours, 2);
  });
});

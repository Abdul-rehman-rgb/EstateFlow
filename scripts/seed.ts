/**
 * Demo data for development. Usage:
 *   npm run seed            (refuses to run if the database already has users)
 *   npm run seed -- --reset (drops every table and reseeds)
 * Reads DATABASE_URL from the environment or .env.local.
 * Every demo account uses the password in DEMO_PASSWORD. Never seed production.
 */
import { closeDb, db, dropAll, ensureSchema } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
import { normalizePhone, normalizeEmail, nowIso, addDays, addHours } from "../src/lib/util";

try { process.loadEnvFile(".env.local"); } catch { /* use the existing environment */ }

const DEMO_PASSWORD = "Demo@12345";
const reset = process.argv.includes("--reset");

async function main() {
  if (reset) await dropAll();
  await ensureSchema();
  if (await db().prepare("SELECT id FROM users LIMIT 1").get()) {
    console.log("The database already has users. Run `npm run seed -- --reset` to wipe and reseed.");
    return;
  }

  const d = db();
  const now = nowIso();
  const ins = async (table: string, row: Record<string, unknown>): Promise<number> => {
    const keys = Object.keys(row);
    const res = await d.prepare(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
      .run(...keys.map((k) => (row[k] === undefined ? null : (row[k] as string | number | null))));
    return res.lastInsertRowid;
  };
  const at = (offsetHours: number) => addHours(now, offsetHours);

  // Branches and teams
  const dubai = await ins("branches", { name: "Dubai Marina", emirate: "Dubai" });
  const abuDhabi = await ins("branches", { name: "Abu Dhabi Corniche", emirate: "Abu Dhabi" });

  // Users (team leader ids are set after creation)
  const hash = hashPassword(DEMO_PASSWORD);
  const user = async (name: string, email: string, role: string, branch: number | null, team: number | null = null) =>
    await ins("users", { name, email, password_hash: hash, role, branch_id: branch, team_id: team, active: 1, created_at: now });

  const admin = await user("Sara Al Mansoori", "admin@demo.ae", "super_admin", null);
  const owner = await user("Khalid Rahman", "owner@demo.ae", "owner", null);
  const finance = await user("Fatima Ali", "finance@demo.ae", "finance", null);
  const manager = await user("Omar Haddad", "manager@demo.ae", "branch_manager", dubai);
  const alpha = await ins("teams", { name: "Team Alpha", branch_id: dubai, leader_id: null });
  const leader = await user("Layla Hassan", "leader@demo.ae", "team_leader", dubai, alpha);
  const agent1 = await user("Ahmed Nasser", "agent1@demo.ae", "agent", dubai, alpha);
  const agent2 = await user("Priya Menon", "agent2@demo.ae", "agent", dubai, alpha);
  const agent3 = await user("Daniel Okafor", "agent3@demo.ae", "agent", dubai);
  const agentAD = await user("Mariam Khoury", "agent4@demo.ae", "agent", abuDhabi);
  await d.prepare("UPDATE teams SET leader_id = ? WHERE id = ?").run(leader, alpha);

  // Properties
  const prop = async (ref: string, p: Record<string, unknown>) =>
    await ins("properties", {
      ref, currency: "AED", emirate: "Dubai", created_at: now, updated_at: now, listed_by: agent1, ...p,
      branch_id: p.branch_id ?? dubai,
      listing_expires_at: p.status === "active" ? addDays(now, 90) : null,
    });
  const p1 = await prop("PRP-00001", { title: "Marina Gate 2BR, high floor", category: "residential", listing_type: "sale", price: 2150000,
    bedrooms: 2, bathrooms: 3, size_sqft: 1420, location: "Dubai Marina", status: "active", listed_by: agent1, approved_by: manager,
    owner_name: "Owner (private)", owner_phone: "0500000001", description: "Sea-view 2 bed, vacant, flexible viewing." });
  const p2 = await prop("PRP-00002", { title: "Downtown studio, Burj view", category: "residential", listing_type: "rent", price: 85000,
    bedrooms: 0, bathrooms: 1, size_sqft: 620, location: "Downtown Dubai", status: "active", listed_by: agent2, approved_by: manager });
  const p3 = await prop("PRP-00003", { title: "Palm Jumeirah villa, 4 bed", category: "residential", listing_type: "sale", price: 9800000,
    bedrooms: 4, bathrooms: 5, size_sqft: 5200, location: "Palm Jumeirah", status: "reserved", listed_by: agent1, approved_by: manager, exclusive: 1 });
  const p4 = await prop("PRP-00004", { title: "JLT office floor, 1,200 sqft", category: "commercial", listing_type: "rent", price: 160000,
    size_sqft: 1200, location: "JLT", status: "active", listed_by: agent3, approved_by: manager });
  const p5 = await prop("PRP-00005", { title: "Business Bay 1BR, off-plan", category: "residential", listing_type: "sale", sale_mode: "off_plan",
    price: 1250000, bedrooms: 1, bathrooms: 2, size_sqft: 820, location: "Business Bay", status: "pending_approval", listed_by: agent3 });
  const p6 = await prop("PRP-00006", { title: "Al Reem plot, residential zone", category: "land", listing_type: "sale", price: 3400000,
    size_sqft: 6000, location: "Al Reem Island", emirate: "Abu Dhabi", branch_id: abuDhabi, status: "active", listed_by: agentAD, approved_by: agentAD });
  const p7 = await prop("PRP-00007", { title: "Dubai Hills 3BR townhouse", category: "residential", listing_type: "sale", price: 3100000,
    bedrooms: 3, bathrooms: 4, size_sqft: 2300, location: "Dubai Hills Estate", status: "sold", listed_by: agent2, approved_by: manager });

  // Leads
  const lead = async (name: string, phone: string | null, email: string | null, f: Record<string, unknown>) => await ins("leads", {
    name, phone, phone_norm: normalizePhone(phone), email, email_norm: normalizeEmail(email), language: "English",
    purpose: "buy", marketing_consent: 1, created_by: manager, created_at: now, updated_at: now, branch_id: dubai, ...f,
  });
  const l1 = await lead("Ravi Shankar", "0501234567", "ravi@example.com", { source: "Property Finder", property_type: "residential",
    budget_max: 2500000, bedrooms: 2, preferred_area: "Marina", timeline: "immediate", status: "qualified", assigned_to: agent1,
    first_response_at: at(-20), property_id: p1, created_at: at(-30) });
  const l2 = await lead("Emma Clarke", "+44 7700 900123", "emma.clarke@example.com", { source: "Website", purpose: "rent",
    property_type: "residential", budget_max: 100000, bedrooms: 1, preferred_area: "Downtown", timeline: "1_3_months",
    status: "assigned", assigned_to: agent2, created_at: at(-3) });
  const l3 = await lead("Hassan Al Farsi", "0557654321", null, { source: "Referral", property_type: "residential", budget_max: 10000000,
    bedrooms: 4, preferred_area: "Palm", timeline: "immediate", status: "viewing_scheduled", assigned_to: agent1, first_response_at: at(-50),
    property_id: p3, created_at: at(-72) });
  const l4 = await lead("Lena Müller", "0523344556", "lena.mueller@example.com", { source: "Bayut", property_type: "residential",
    budget_max: 1600000, bedrooms: 1, preferred_area: "Business Bay", timeline: "3_6_months", status: "contacted", assigned_to: agent2,
    first_response_at: at(-5), created_at: at(-10) });
  const l5 = await lead("Ravi S.", "+971 50 123 4567", "ravi.alt@example.com", { source: "Website", status: "new", assigned_to: agent3, created_at: at(-1) });
  const l6 = await lead("Sophie Laurent", "0561112233", "sophie@example.com", { source: "Facebook/Instagram", status: "nurture", assigned_to: agent3,
    first_response_at: at(-100), created_at: at(-120) });
  const l7 = await lead("Yusuf Demir", "0509876543", null, { source: "Walk-in", property_type: "residential", budget_max: 1300000, bedrooms: 1,
    preferred_area: "Business Bay", timeline: "1_3_months", status: "new", created_at: at(-2) });
  const l8 = await lead("James Whitfield", "0544556677", "james.w@example.com", { source: "Phone", property_type: "residential",
    budget_max: 3200000, bedrooms: 3, preferred_area: "Dubai Hills", timeline: "immediate", status: "offer_submitted", assigned_to: agent2,
    first_response_at: at(-200), property_id: p7, created_at: at(-240) });
  const l9 = await lead("Mohammed Saeed", "0588877665", "m.saeed@example.com", { branch_id: abuDhabi, source: "Phone", property_type: "land",
    budget_max: 3600000, timeline: "3_6_months", status: "new", assigned_to: agentAD, created_at: at(-4) });

  // Activities
  const act = async (leadId: number, kind: string, body: string, userId: number | null, when: string, outcome: string | null = null) =>
    await ins("activities", { lead_id: leadId, kind, body, outcome, user_id: userId, created_at: when });
  await act(l1, "call", "Discussed Marina budget and move-in date. Wants a viewing this week.", agent1, at(-19), "follow_up_required");
  await act(l1, "whatsapp", "Sent floor plan and PRP-00001 brochure.", agent1, at(-18));
  await act(l3, "meeting", "Met at the office; wants Palm villas only.", agent1, at(-48));
  await act(l8, "note", "Offer accepted verbally; awaiting signed reservation.", agent2, at(-100));
  await act(l4, "email", "Sent Business Bay shortlist.", agent2, at(-4));

  // Viewings
  const viewing = async (propId: number, leadId: number, agent: number, when: string, status: string, outcome: string | null = null) =>
    await ins("viewings", { property_id: propId, lead_id: leadId, agent_id: agent, branch_id: dubai, scheduled_at: when, duration_min: 45,
      mode: "in_person", location: "Meet at the lobby", status, outcome, created_by: agent, created_at: now, updated_at: now,
      feedback: status === "completed" ? "Liked the layout, worried about service charges." : null });
  const tomorrowMorning = new Date(); tomorrowMorning.setDate(tomorrowMorning.getDate() + 1); tomorrowMorning.setHours(10, 0, 0, 0);
  await viewing(p1, l1, agent1, tomorrowMorning.toISOString(), "scheduled");
  const later = new Date(tomorrowMorning); later.setHours(14, 30);
  await viewing(p3, l3, agent1, later.toISOString(), "scheduled");
  await viewing(p3, l3, agent1, at(-30), "completed", "interested");
  await viewing(p2, l2, agent2, addHours(now, 4), "scheduled");

  // Deals
  const dealReserved = await ins("deals", { title: `${"PRP-00003"} — Hassan Al Farsi`, lead_id: l3, property_id: p3, branch_id: dubai, agent_id: agent1,
    deal_type: "sale", stage: "reserved", deal_value: 9800000, currency: "AED", commission_percent: 2, commission_amount: 196000,
    commission_status: "pending", reservation_amount: 100000, reservation_expires_at: addDays(now, 7), created_by: agent1,
    created_at: at(-40), updated_at: at(-10) });
  await ins("offers", { deal_id: dealReserved, amount: 9500000, counter_amount: 9800000, terms: "Cash, 30-day completion", status: "countered",
    buyer_party: "Hassan Al Farsi", seller_party: "Owner (private)", created_by: agent1, created_at: at(-40) });
  await ins("deals", { title: "PRP-00007 — James Whitfield", lead_id: l8, property_id: p7, branch_id: dubai, agent_id: agent2,
    deal_type: "sale", stage: "contract_signed", deal_value: 3100000, currency: "AED", commission_percent: 2, commission_amount: 62000,
    commission_status: "pending", expected_close_date: addDays(now, 20), created_by: agent2, created_at: at(-200), updated_at: at(-24) });

  // Tasks
  const task = async (title: string, assignee: number, due: string, leadId: number | null, priority = "normal") =>
    await ins("tasks", { title, lead_id: leadId, assigned_to: assignee, branch_id: dubai, due_at: due, priority, status: "open", created_by: manager, created_at: now });
  await task("Call Emma back — first response overdue", agent2, at(-2), l2, "urgent");
  await task("Post-viewing follow-up: Hassan Al Farsi", agent1, at(-6), l3, "high");
  await task("Send Business Bay shortlist to Lena", agent2, at(5), l4);
  await task("Verify duplicate Ravi record", agent3, at(20), l5);
  await task("Chase Sophie for re-engagement — overdue 3 days", agent3, at(-72), l6);
  await task("Collect Emirates ID for reservation", agent1, at(48), l3, "high");

  // Audit entry for the seed itself
  await ins("audit_log", { user_id: admin, action: "seed", entity: "system", entity_id: null, details: JSON.stringify({ demo: true }), created_at: now });

  console.log("Demo data created.");
  console.log(`Password for every demo account: ${DEMO_PASSWORD}`);
  console.log("Accounts: admin@demo.ae (super admin), owner@demo.ae, manager@demo.ae, leader@demo.ae,");
  console.log("          agent1@demo.ae, agent2@demo.ae, agent3@demo.ae, agent4@demo.ae (Abu Dhabi), finance@demo.ae");
}

main().then(() => closeDb()).catch(async (err) => { console.error(err); await closeDb(); process.exit(1); });

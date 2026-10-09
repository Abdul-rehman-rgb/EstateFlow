import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { Icon, Logo, type IconName } from "@/components/icons";
import "./landing.css";

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: "leads", title: "Lead inbox & assignment", body: "Every enquiry in one place, scored by priority, de-duplicated on phone and email, and routed by round-robin, workload or hand." },
  { icon: "clock", title: "First-response SLA", body: "Know exactly which leads are still waiting. Breaches and overdue follow-ups surface on the dashboard before they cost a deal." },
  { icon: "building", title: "Listings with approvals", body: "Draft → pending approval → active. Permit tracking, expiry dates, private owner records and automatic matching to buyer briefs." },
  { icon: "calendar", title: "Conflict-free viewings", body: "Schedule in-person or virtual viewings. Double bookings are caught, and a follow-up task is created after every visit." },
  { icon: "deals", title: "Deal pipeline", body: "A kanban board from offer to signing, with counter-offers, reservation details and stage rules that keep the data honest." },
  { icon: "money", title: "Commission workflow", body: "Pending → approved → paid, signed off by finance. Approval resets automatically if the deal value changes." },
  { icon: "reports", title: "Reports that answer questions", body: "Funnel, response SLA, source ROI, agent leaderboard, inventory, forecast, viewing outcomes and commissions — all exportable to CSV." },
  { icon: "file", title: "Documents & versions", body: "Upload contracts and IDs with version history, approval status, expiry dates and access tied to the parent record." },
  { icon: "upload", title: "CSV import with dry run", body: "Bring your existing leads and listings across safely. Validate the file first, see every error, then commit." },
];

const STEPS = [
  { n: "01", title: "Capture", body: "Leads arrive from portals, campaigns, walk-ins or CSV — duplicates are flagged on save." },
  { n: "02", title: "Respond", body: "Auto-assigned to the right agent with an SLA clock running on first contact." },
  { n: "03", title: "Show", body: "Matching listings suggested, viewings booked without clashes, outcomes logged." },
  { n: "04", title: "Close", body: "Offers tracked through signing; commission approved and paid by finance." },
];

const ROLES = ["Super Admin", "Company Owner", "Branch Manager", "Team Leader", "Agent", "Finance"];

export default async function Home() {
  const user = await currentUser();
  const cta = user
    ? { href: "/dashboard", label: "Open dashboard" }
    : { href: "/login", label: "Sign in" };

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <Link href="/" className="lp-logo"><Logo size={32} /> EstateFlow</Link>
          <nav className="lp-links" aria-label="Sections">
            <a href="#features">Features</a>
            <a href="#workflow">Workflow</a>
            <a href="#security">Security</a>
          </nav>
          <Link href={cta.href} className="lp-btn lp-btn-dark">{cta.label} <Icon name="arrow" size={16} /></Link>
        </div>
      </header>

      <section className="lp-hero">
        <div className="lp-wrap lp-hero-inner">
          <div className="lp-hero-copy">
            <span className="lp-eyebrow"><Icon name="pin" size={14} /> Built for UAE brokerages</span>
            <h1>Close more property deals, <em>without the chaos.</em></h1>
            <p className="lp-lead">
              EstateFlow brings leads, listings, viewings, deals and commissions into one fast workspace —
              so agents respond first, managers see everything, and finance trusts the numbers.
            </p>
            <div className="lp-cta-row">
              <Link href={cta.href} className="lp-btn lp-btn-primary">{user ? "Open dashboard" : "Get started"} <Icon name="arrow" size={16} /></Link>
              <a href="#features" className="lp-btn lp-btn-ghost">See what&apos;s inside</a>
            </div>
            <ul className="lp-hero-points">
              <li><Icon name="check" size={16} /> Role-based access</li>
              <li><Icon name="check" size={16} /> Full audit trail</li>
              <li><Icon name="check" size={16} /> Works on phones</li>
            </ul>
          </div>

          <div className="lp-mock" aria-hidden>
            <div className="lp-mock-bar"><i /><i /><i /><span>app.estateflow.ae/dashboard</span></div>
            <div className="lp-mock-body">
              <div className="lp-mock-side">
                <div className="lp-mock-logo"><Logo size={22} /></div>
                {["dashboard", "leads", "building", "calendar", "deals", "reports"].map((n, i) => (
                  <span key={n} className={i === 0 ? "on" : ""}><Icon name={n as IconName} size={15} /></span>
                ))}
              </div>
              <div className="lp-mock-main">
                <div className="lp-mock-title">Good morning, Sara</div>
                <div className="lp-mock-kpis">
                  <div><small>New leads</small><b>48</b><em className="up">+12%</em></div>
                  <div><small>Viewings today</small><b>9</b><em>3 virtual</em></div>
                  <div><small>Pipeline</small><b>AED 14.2M</b><em className="up">+AED 2.1M</em></div>
                </div>
                <div className="lp-mock-grid">
                  <div className="lp-mock-card">
                    <small>Leads by week</small>
                    <div className="lp-bars">
                      {[38, 52, 44, 66, 58, 74, 88].map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}
                    </div>
                  </div>
                  <div className="lp-mock-card">
                    <small>Pipeline</small>
                    <div className="lp-stages">
                      {[["Offer", 72, "#0d9488"], ["Reserved", 54, "#14b8a6"], ["Signing", 36, "#5eead4"], ["Won", 22, "#f2c46d"]].map(([l, w, c]) => (
                        <div key={l as string}><span>{l}</span><i style={{ width: `${w}%`, background: c as string }} /></div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="lp-float lp-float-a"><span className="lp-dot ok" /> Lead assigned to Omar · 2 min ago</div>
            <div className="lp-float lp-float-b"><Icon name="money" size={16} /> Commission approved <b>AED 48,000</b></div>
          </div>
        </div>
      </section>

      <section className="lp-roles">
        <div className="lp-wrap">
          <p>One workspace, the right view for every role</p>
          <ul>{ROLES.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      </section>

      <section id="features" className="lp-section">
        <div className="lp-wrap">
          <div className="lp-head">
            <span className="lp-kicker">Features</span>
            <h2>Everything a brokerage runs on, in one system</h2>
            <p>From the first enquiry to the commission payout — no spreadsheets, no lost WhatsApp threads.</p>
          </div>
          <div className="lp-features">
            {FEATURES.map((f) => (
              <article key={f.title} className="lp-feature">
                <span className="lp-ficon"><Icon name={f.icon} size={20} /></span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="lp-section lp-dark">
        <div className="lp-wrap">
          <div className="lp-head">
            <span className="lp-kicker">Workflow</span>
            <h2>From enquiry to keys, step by step</h2>
            <p>Each stage hands off cleanly to the next, and every action lands in the record&apos;s timeline.</p>
          </div>
          <ol className="lp-steps">
            {STEPS.map((s) => (
              <li key={s.n}>
                <span className="lp-step-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="security" className="lp-section">
        <div className="lp-wrap lp-split">
          <div>
            <span className="lp-kicker">Security & control</span>
            <h2>Everyone sees exactly what they should — nothing more</h2>
            <p className="lp-muted">
              Agents see their own leads, team leaders see their team, branch managers see their branch and
              finance sees signed deals. Records outside your scope simply don&apos;t exist for you.
            </p>
            <ul className="lp-checks">
              <li><Icon name="shield" size={18} /> Role and record-level checks on every request</li>
              <li><Icon name="key" size={18} /> Hashed passwords and secure, httpOnly sessions</li>
              <li><Icon name="file" size={18} /> Audit log of sign-ins, changes, approvals and exports</li>
              <li><Icon name="user" size={18} /> Offboarding revokes sessions instantly</li>
            </ul>
          </div>
          <div className="lp-audit" aria-hidden>
            <div className="lp-audit-head"><Icon name="shield" size={16} /> Audit log</div>
            {[
              ["Deal #214 moved to Contract signed", "Branch Manager", "09:42"],
              ["Commission approved · AED 48,000", "Finance", "09:31"],
              ["Listing DXB-0193 approved", "Branch Manager", "09:12"],
              ["Lead merged into #1802", "Team Leader", "08:57"],
              ["Signed in", "Agent", "08:40"],
            ].map(([a, w, t]) => (
              <div key={a} className="lp-audit-row"><span className="lp-dot" /><div><b>{a}</b><small>{w}</small></div><time>{t}</time></div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section lp-cta-wrap">
        <div className="lp-wrap">
          <div className="lp-cta">
            <h2>Ready to run your brokerage from one screen?</h2>
            <p>Sign in to your workspace and see today&apos;s leads, viewings and deals at a glance.</p>
            <Link href={cta.href} className="lp-btn lp-btn-primary">{cta.label} <Icon name="arrow" size={16} /></Link>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <div className="lp-logo"><Logo size={26} /> EstateFlow</div>
          <span>© {new Date().getFullYear()} EstateFlow · Real Estate CRM for the UAE</span>
        </div>
      </footer>
    </div>
  );
}

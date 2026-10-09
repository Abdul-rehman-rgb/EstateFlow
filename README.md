# Real Estate CRM

A working first release of the **Launch MVP** scope from the Real Estate CRM Feature Catalogue
(section 17), for UAE brokerages. Built with **Next.js 15 (App Router) and Node.js 22**, using
Node's built-in SQLite (`node:sqlite`) so there is no native database build step.

## Quick start

```bash
npm install
npm run seed          # demo data (refuses to overwrite an existing database)
npm run dev           # http://localhost:3000
```

Production:

```bash
npm run build
NODE_ENV=production npm start
```

Environment variables (optional):

| Variable | Default | Purpose |
| --- | --- | --- |
| `CRM_DB_PATH` | `data/crm.db` | SQLite database file |
| `CRM_UPLOAD_DIR` | `data/uploads` | Where uploaded documents are stored |

Reset demo data with `npm run seed -- --reset`.

### Demo accounts

Password for every demo account: `Demo@12345` (change it immediately outside development).

| Email | Role | Scope |
| --- | --- | --- |
| admin@demo.ae | Super Admin | Everything, including users and settings |
| owner@demo.ae | Company Owner | Company-wide KPIs, audit log |
| manager@demo.ae | Branch Manager (Dubai Marina) | Branch leads, listings, approvals, reports |
| leader@demo.ae | Team Leader (Team Alpha) | Team's leads and deals |
| agent1@demo.ae, agent2@demo.ae | Agent (Team Alpha) | Own leads and deals; branch inventory |
| agent3@demo.ae | Agent (no team) | Own leads and deals |
| agent4@demo.ae | Agent (Abu Dhabi) | Abu Dhabi branch only |
| finance@demo.ae | Finance User | Signed/closed deals, commissions, finance reports |

## Tests

```bash
npm run build && npm test
```

`npm test` starts the production build against a throwaway seeded database and runs 48
end-to-end API tests covering authentication, role scope, duplicate detection, assignment,
viewing conflicts, the listing approval workflow, deal stages, commission approval, document
access, CSV import, reports and the audit trail.

## What is built (mapped to the catalogue)

| Catalogue area | Status in this release |
| --- | --- |
| 2. Dashboard | Role-aware KPIs, filters (date, source, agent), activity feed, my tasks, upcoming viewings, expiring listings and documents |
| 3. Lead management | Lead inbox, profiles, configurable stages and lost reasons, duplicate detection on phone/email with merge, priority score, round-robin / workload / manual assignment, follow-up tasks, contact timeline |
| 4. Property & listings | Inventory, owner records (private), listing workflow (draft → pending approval → active, with approve/return), expiry dates, permit tracking, property matching for leads, listing performance |
| 6. Communication | Activity logging for calls, WhatsApp, email, SMS, meetings and notes (first-response SLA tracked). *Sending messages is deferred; see below.* |
| 7. Viewings | Scheduler with agent conflict detection, in-person/virtual, outcomes, reschedule, automatic post-viewing follow-up task |
| 8. Pipeline & deals | Pipeline board and list, stage rules (closed won only after signing, lost needs a reason), offers and counter-offers, reservation fields, deal tasks, deal timeline |
| 9. Commission | Percentage commission, pending → approved → paid workflow by finance; approval resets if the deal value changes; expected commission forecast |
| 11. Team & users | Users and roles, branches, teams, offboarding via deactivation (sessions revoked), audit trail |
| 12. Reports | Funnel, response SLA, source ROI, agent leaderboard, inventory, pipeline forecast, viewing outcomes, commissions; CSV export |
| 13. Documents | Upload with version history, approval status, expiry, sensitive-document restriction, access checked against the parent record |
| 15. Responsive UI | Responsive layout with a collapsible menu on phones |
| 16. Security | Password hashing (scrypt), server-side sessions in httpOnly SameSite=Strict cookies, role and record-level checks on every route, audit logging |
| 17. MVP — must-have | All items above are covered except the items listed below |

## Deferred (next release or later, per the catalogue)

- **Messaging integrations** — WhatsApp Business, email and SMS sending and delivery tracking, and portal feeds (Property Finder, Bayut, dubizzle). These need approved provider accounts and are not wired up.
- **Arabic interface and right-to-left layout** — the UI is English only.
- **XLSX import** — CSV only. Export spreadsheets as CSV.
- **Commission splits** — team, branch and external-agency splits, and VAT/invoicing.
- **Scheduled report delivery** and saved views.
- **Workflow builder, AI features, e-signature, calendar sync, native apps.**
- **Property management module** (leases, rent tracking, owner statements).

## Project layout

```
src/
  app/                  Next.js pages (UI) and api/ route handlers
    (app)/              Authenticated pages (dashboard, leads, properties, viewings, tasks, deals, reports…)
    api/                JSON API, one folder per resource
  components/           Shared UI (shell, form controls, upload, metadata cache)
  lib/
    db.ts               Schema, connection, settings
    permissions.ts      Roles, permissions and record-scope rules
    leads.ts            Duplicate detection, assignment, scoring, matching, merge
    properties.ts       Listing rules and status transitions
    viewings.ts         Conflict detection
    deals.ts            Deal stages, commission, effects on leads and listings
    documents.ts        Storage, versioning, visibility
    reports.ts          Report builders (scope-aware)
    imports.ts          CSV import with validation and dry run
    audit.ts            Audit log writer
scripts/seed.ts         Demo data
test/api.test.ts        End-to-end API tests
```

## Design notes

- **Record scope.** Each role sees records through one SQL predicate built in
  `src/lib/permissions.ts` (`ownerScope`, `inventoryScope`, `dealScope`). Lists and detail
  endpoints use the same predicate, so a record outside a user's scope returns 404 rather than
  leaking its existence.
- **Money.** Amounts are stored as numbers in AED. Commission is computed as
  `deal value × percent / 100` and recalculated when the value or rate changes.
- **Times.** Stored as UTC ISO strings. The UI displays them in the viewer's local timezone.
- **Duplicates.** Phone numbers are normalised to international format (`05x…` becomes `9715x…`)
  before comparison.
- **Audit.** Creates, updates, stage changes, approvals, exports, deletions, sign-ins and
  failed sign-ins are recorded in `audit_log`.

## Before going live

1. Create the first super admin with `npm run create-admin -- --name "Name" --email you@company.ae --password "at-least-12-chars"`,
   then add everyone else from Administration. The demo seed is for development only.
2. Serve over HTTPS. Session cookies are marked `Secure` in production.
3. Confirm the UAE-specific points in catalogue section 19 with the client: advertising permits,
   portal API access, VAT, data-retention rules and document templates. This release supports
   operational tracking only and is not a substitute for official systems.
4. Back up `data/` (the database and uploads) on a schedule and test the restore.

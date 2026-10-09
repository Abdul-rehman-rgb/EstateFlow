/**
 * Creates a super admin for a real deployment. Usage:
 *   npm run create-admin -- --name "Sara Al Mansoori" --email admin@company.ae --password "use-a-long-passphrase"
 * Refuses to run if the email already exists. The password must be at least 12 characters.
 */
import { closeDb, db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
import { nowIso } from "../src/lib/util";

try { process.loadEnvFile(".env.local"); } catch { /* use the existing environment */ }

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const name = arg("name");
const email = arg("email")?.trim().toLowerCase();
const password = arg("password");
async function main() {
  if (!name || !email || !password) {
    console.error("Required: --name, --email, --password");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }
  if (await db().prepare("SELECT id FROM users WHERE lower(email) = lower(?)").get(email)) {
    console.error(`A user with ${email} already exists.`);
    process.exit(1);
  }
  const res = await db()
    .prepare("INSERT INTO users (name, email, password_hash, role, active, created_at) VALUES (?, ?, ?, 'super_admin', 1, ?)")
    .run(name, email, hashPassword(password), nowIso());
  await db().prepare("INSERT INTO audit_log (user_id, action, entity, entity_id, details, created_at) VALUES (?, 'create', 'user', ?, ?, ?)")
    .run(null, res.lastInsertRowid, JSON.stringify({ role: "super_admin", via: "create-admin script" }), nowIso());
  console.log(`Super admin created: ${email}`);
}

main().then(() => closeDb()).catch(async (err) => { console.error(err); await closeDb(); process.exit(1); });

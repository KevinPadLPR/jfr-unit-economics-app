// Seeds the app_users table (auth) into data/dev.sqlite. This is separate
// from build_dev_db.py on purpose — that script owns real ranch data import
// (Python/openpyxl), this one owns app-specific auth state (Node/bcryptjs),
// so a rebuild of one doesn't wipe the other. Safe to re-run.
//
// Uses node:sqlite (built into Node 22.5+) rather than better-sqlite3 — see
// the comment in src/lib/db.ts for why (Turbopack can't link native modules
// inside this project's Box-synced folder).
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data", "dev.sqlite");

const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'rancher')),
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const TEST_ACCOUNTS = [
  { email: "admin@jfrranch.com", name: "Admin (Long Point)", role: "admin", password: "JFRAdmin2026!" },
  { email: "rancher@jfrranch.com", name: "Rancher (Test Account)", role: "rancher", password: "JFRRancher2026!" },
];

const upsert = db.prepare(`
  INSERT INTO app_users (id, email, name, role, password_hash, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(email) DO UPDATE SET
    name = excluded.name,
    role = excluded.role,
    password_hash = excluded.password_hash
`);

for (const account of TEST_ACCOUNTS) {
  const password_hash = bcrypt.hashSync(account.password, 10);
  upsert.run(crypto.randomUUID(), account.email, account.name, account.role, password_hash, new Date().toISOString());
  console.log(`Seeded ${account.role} account: ${account.email}`);
}

db.close();

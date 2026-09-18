import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

/**
 * Dev-only data source. Production is meant to read the same tables from
 * Supabase once the sync job exists (see /data/README.md and
 * Context - Dashboard Web App Handoff.md §5b) — the query functions in
 * src/lib/data/* are written against plain SQL so swapping the connection
 * here is the only change that should be needed later.
 *
 * Uses Node's built-in node:sqlite (experimental, Node 22.5+) rather than
 * better-sqlite3 on purpose: better-sqlite3 ships a native .node binary, and
 * Next.js 16's Turbopack links native deps into .next/ via an NTFS junction
 * point — which fails inside this project's Box-synced folder ("Incorrect
 * function", os error 1; Box's virtual filesystem driver doesn't support
 * junction creation). node:sqlite is compiled into Node itself, so there's
 * no native module to link and no junction to create.
 */

const DB_PATH = path.join(process.cwd(), "data", "dev.sqlite");

type Row = Record<string, unknown>;

/**
 * node:sqlite returns rows with a null prototype (`Object.create(null)`).
 * React Server Components refuse to serialize those to Client Components
 * ("Only plain objects... can be passed"), so every row is spread into a
 * plain object here, once, instead of at every call site.
 */
function toPlain<T>(row: T): T {
  return row == null ? row : ({ ...(row as Row) } as T);
}

export interface PreparedStatement {
  all<T = Row>(...params: unknown[]): T[];
  get<T = Row>(...params: unknown[]): T | undefined;
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

export interface AppDb {
  prepare(sql: string): PreparedStatement;
}

let db: AppDb | null = null;

export class DataUnavailableError extends Error {}

export function getDb(): AppDb {
  if (db) return db;
  if (!fs.existsSync(DB_PATH)) {
    throw new DataUnavailableError(
      `Dev database not found at ${DB_PATH}. Run: npm run db:build, then npm run db:seed`
    );
  }
  const raw = new DatabaseSync(DB_PATH, { readOnly: true });
  db = {
    prepare(sql: string) {
      const stmt = raw.prepare(sql);
      return {
        all: (...params: unknown[]) => (stmt.all(...params) as Row[]).map(toPlain),
        get: (...params: unknown[]) => toPlain(stmt.get(...params)),
        run: (...params: unknown[]) => stmt.run(...params),
      };
    },
  };
  return db;
}

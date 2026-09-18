import { DatabaseSync, type SQLInputValue } from "node:sqlite";
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
 * plain object here, once, instead of at every call site. Callers cast the
 * result to their own row interface (`as SomeRow[]`) — kept untyped-generic
 * here on purpose, since a generic `all<T>()` produced confusing inference
 * once chained with array methods like `.reverse()`.
 */
function toPlain(row: unknown): Row | undefined {
  return row == null ? undefined : { ...(row as Row) };
}

export interface PreparedStatement {
  all(...params: SQLInputValue[]): Row[];
  get(...params: SQLInputValue[]): Row | undefined;
  run(...params: SQLInputValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

export interface AppDb {
  prepare(sql: string): PreparedStatement;
}

let db: AppDb | undefined;

export class DataUnavailableError extends Error {}

export function getDb(): AppDb {
  if (db) return db;
  if (!fs.existsSync(DB_PATH)) {
    throw new DataUnavailableError(
      `Dev database not found at ${DB_PATH}. Run: npm run db:build, then npm run db:seed`
    );
  }
  const raw = new DatabaseSync(DB_PATH, { readOnly: true });
  const wrapped: AppDb = {
    prepare(sql: string): PreparedStatement {
      const stmt = raw.prepare(sql);
      return {
        all: (...params: SQLInputValue[]) => (stmt.all(...params) as unknown[]).map((r) => toPlain(r) as Row),
        get: (...params: SQLInputValue[]) => toPlain(stmt.get(...params)),
        run: (...params: SQLInputValue[]) => stmt.run(...params),
      };
    },
  };
  db = wrapped;
  return wrapped;
}

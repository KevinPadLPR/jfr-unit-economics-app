"""
build_dev_db.py
================

Builds the JFR Ranch Dashboard development SQLite database
(`web/data/dev.sqlite`) from the REAL source files listed below.

This script is idempotent: every table it manages is dropped and
recreated on each run, so `python build_dev_db.py` always produces a
byte-for-byte-equivalent database from the same source files.

There are four families of output tables (see `web/data/README.md`
for the full narrative, including known data-quality caveats):

1. `gl_*` tables      - derived from the CenterPoint General Ledger /
                         "Unit Economics Reporting" Excel pipeline.
                         Real DOLLAR figures.
2. `master_lot_schedule` /
   `master_crop_schedule` - the unified lot/crop-lot dimension tables,
                         pulled live from Supabase (see
                         docs/PROMPT - Master Schedule Unification.md).
                         That project's `supabase_sync.py` is the one
                         place that writes these two tables; this
                         script only reads them, same as the deployed
                         app eventually will.
3. App-native tables  - copied verbatim (same name, same columns) from
                         a snapshot of the client's Supabase cattle
                         management app. Real HEAD COUNTS, WEIGHTS,
                         DATES, MARKET QUOTES, HEDGE POSITIONS. This is
                         a *different* Supabase project from #2 above
                         (John's field-app project, not JFR's own) -
                         still sourced from the local ranch.sqlite
                         snapshot, not a live connection.
4. `lot_crosswalk`   - bridge table tying the two systems together
                         (they do NOT share a lot identity - see
                         README).

No table in this script is invented or backfilled: every row here is
copied straight out of one of the real source files/APIs below. Where
a source didn't match what an earlier scoping pass assumed, this
script uses what actually exists and the discrepancy is called out in
a comment at the point it was discovered (also summarized in the
README).

Requires: Python 3.14 stdlib (sqlite3, csv, datetime, pathlib, urllib)
plus `openpyxl` for reading .xlsx files. No pandas/bcrypt/supabase-py
dependency - the Supabase reads in this script are plain REST calls
via urllib, matching the "minimal deps" rule the rest of this script
already followed.
"""

from __future__ import annotations

import csv
import datetime
import json
import os
import sqlite3
import urllib.error
import urllib.request
from pathlib import Path

import openpyxl

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
# Everything below the script/data output paths is resolved relative to this
# file's location, so the script works no matter where the repo is checked
# out. The *source* files live outside the repo (in Box, on this machine)
# and are therefore necessarily absolute - they are the one exception the
# task calls out as acceptable to hardcode.

SCRIPT_DIR = Path(__file__).resolve().parent
WEB_DIR = SCRIPT_DIR.parent
DATA_DIR = WEB_DIR / "data"
DEV_DB_PATH = DATA_DIR / "dev.sqlite"

# --- Source 1: GL / Unit Economics Reporting Excel pipeline ---------------
# NOTE: the task brief named this file
#   "JFR Unit Economics - September 2026 - 09-03-2026_14h50m.xlsx"
# but no file with that exact name was ever observed in the Output folder.
# Instead, the Output folder appears to be actively re-written by a live
# ETL/notebook process: during a single work session the file was observed
# as "..._17h37m.xlsx", then moments later as "..._17h45m.xlsx" (same
# 09-03-2026 books-through date each time, just a newer run/save stamp, plus
# a transient non-.xlsx lock artifact that disappears once the writer is
# done). Because the exact filename is a moving target, we do NOT hardcode
# it: we glob the Output directory for "JFR Unit Economics*.xlsx" files and
# pick whichever has the newest modified time at run time. This is the one
# deliberate departure from "no hardcoded paths besides the known source
# files" - the *directory* is still a hardcoded constant, only the exact
# filename is resolved dynamically.
UNIT_ECON_DIR = Path(
    r"C:\Users\UserTwo\Box\Working\Reagan Ranch\Unit Economics Reporting\Output"
)


def find_latest_unit_econ_workbook() -> Path:
    candidates = sorted(
        UNIT_ECON_DIR.glob("JFR Unit Economics*.xlsx"),
        key=lambda p: p.stat().st_mtime,
    )
    if not candidates:
        raise FileNotFoundError(
            f"No 'JFR Unit Economics*.xlsx' file found in {UNIT_ECON_DIR}"
        )
    return candidates[-1]

GL_DATABASE_DIR = Path(
    r"C:\Users\UserTwo\Box\Working\Reagan Ranch\Unit Economics Reporting\Database"
)
ACCOUNT_MAP_XLSX = GL_DATABASE_DIR / "Account Map.xlsx"

# --- Source 2: Supabase (JFR's own project) - master_lot_schedule / master_crop_schedule ---
# JFR_-prefixed on purpose (not generic SUPABASE_URL/SUPABASE_SERVICE_KEY) -
# this machine's Dagster orchestration already owns those generic names for
# a different project; see Unit Economics Reporting/supabase_sync.py, which
# writes the two tables this script reads.
ENV_LOCAL_PATH = WEB_DIR / ".env.local"
# Fallback source for the same two variables: the sibling Excel project
# already has them (it's the same Supabase project supabase_sync.py writes
# to) - reusing that file means the credentials only need to be set in one
# place, not copy-pasted between two .env files.
UNIT_ECON_ENV_PATH = WEB_DIR.parent.parent / "Unit Economics Reporting" / ".env"


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader (same approach as supabase_sync.py) - avoids
    adding a dependency for two variables Next.js itself loads at runtime
    but this standalone script needs to load itself. Uses setdefault, so
    the first file loaded (web/.env.local) wins if a name appears in both."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip().strip('"').strip("'")
        # Skip blank values (e.g. an unfilled placeholder line in
        # web/.env.local) so they don't block UNIT_ECON_ENV_PATH's fallback
        # via setdefault below.
        if value:
            os.environ.setdefault(key.strip(), value)


_load_dotenv(ENV_LOCAL_PATH)
_load_dotenv(UNIT_ECON_ENV_PATH)

SUPABASE_URL = os.environ.get("JFR_SUPABASE_URL")
SUPABASE_SECRET_KEY = os.environ.get("JFR_SUPABASE_SECRET_KEY")


def fetch_supabase_table(table: str) -> list[dict]:
    """Read every row of `table` via Supabase's PostgREST API (a plain GET,
    no supabase-py dependency). Both tables this script reads are small
    (tens of rows), so no pagination is needed - PostgREST's default page
    size (1000) covers them comfortably."""
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise RuntimeError(
            "JFR_SUPABASE_URL / JFR_SUPABASE_SECRET_KEY not set. Add them to "
            f"{ENV_LOCAL_PATH} - see Unit Economics Reporting/"
            "'Guide - Supabase Setup for JFR Sync.md' for how to get them "
            "(same Supabase project supabase_sync.py already pushes to)."
        )
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}?select=*"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": SUPABASE_SECRET_KEY,
            "Authorization": f"Bearer {SUPABASE_SECRET_KEY}",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase GET {table} failed ({exc.code}): {body}") from exc


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def iso_or_passthrough(value):
    """Convert openpyxl datetime cells to 'YYYY-MM-DD' text; pass everything
    else through unchanged. Used uniformly across every GL sheet column so
    that both genuine date columns AND the occasional stray datetime found
    in an otherwise-text column (observed in Data_GL's Txn Number column)
    come out as clean ISO text instead of a Python datetime repr.
    """
    if isinstance(value, datetime.datetime):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, datetime.date):
        return value.isoformat()
    return value


def read_sheet_rows(ws, header_row: int):
    """Yield each data row (as a tuple) below `header_row`, converting
    datetimes to ISO date text along the way."""
    for row in ws.iter_rows(min_row=header_row + 1, values_only=True):
        # Skip fully-blank trailing rows some Excel exports leave behind.
        if all(v is None for v in row):
            continue
        yield tuple(iso_or_passthrough(v) for v in row)


def find_header_row(ws, expected_first_cell: str, max_scan: int = 10) -> int:
    """Scan the first `max_scan` rows of a sheet and return the 1-based row
    number whose first cell equals `expected_first_cell`. Several of the
    small reference workbooks have 1-3 title/notes rows above the real
    header, so we detect the header row instead of hardcoding it.
    """
    for row_idx in range(1, max_scan + 1):
        cell_value = ws.cell(row=row_idx, column=1).value
        if cell_value == expected_first_cell:
            return row_idx
    raise ValueError(
        f"Could not find a header row starting with {expected_first_cell!r} "
        f"in the first {max_scan} rows of sheet {ws.title!r}."
    )


def csv_value(v):
    """Empty CSV strings become SQL NULL; everything else passes through as
    text (further numeric casting is done per-column where useful)."""
    return v if v not in ("", None) else None


# ---------------------------------------------------------------------------
# Part 1: gl_* tables from the Unit Economics Excel workbook
# ---------------------------------------------------------------------------

def build_gl_transactions(conn: sqlite3.Connection, wb) -> int:
    conn.execute("DROP TABLE IF EXISTS gl_transactions")
    conn.execute(
        """
        CREATE TABLE gl_transactions (
            date              TEXT,
            month_end         TEXT,
            week_end          TEXT,
            acct              INTEGER,
            account           TEXT,
            account_label     TEXT,
            lot               TEXT,
            profit_center     TEXT,
            production_center TEXT,
            production_year   INTEGER,
            txn_number        TEXT,
            name              TEXT,
            notation          TEXT,
            amount            REAL,
            statement         TEXT,
            report_section    TEXT,
            report_line       TEXT,
            group_name        TEXT,
            sign              INTEGER,
            report_amount     REAL,
            via_allocation    TEXT,
            source_file       TEXT
        )
        """
    )
    ws = wb["Data_GL"]
    # Header is on row 1 for this sheet (verified directly against the file).
    rows = list(read_sheet_rows(ws, header_row=1))
    conn.executemany(
        "INSERT INTO gl_transactions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        rows,
    )
    conn.execute("CREATE INDEX idx_gl_transactions_lot ON gl_transactions(lot)")
    conn.execute("CREATE INDEX idx_gl_transactions_date ON gl_transactions(date)")
    return len(rows)


def build_gl_head_days(conn: sqlite3.Connection, wb) -> int:
    conn.execute("DROP TABLE IF EXISTS gl_head_days")
    conn.execute(
        """
        CREATE TABLE gl_head_days (
            lot           TEXT,
            month_end     TEXT,
            head_start    INTEGER,
            purchased     INTEGER,
            born          INTEGER,
            transfer_in   INTEGER,
            sold          INTEGER,
            died          INTEGER,
            transfer_out  INTEGER,
            head_end      INTEGER,
            head_days     REAL,
            lbs_in        REAL,
            cost_in_dollars REAL
        )
        """
    )
    ws = wb["Data_HeadDays"]
    rows = list(read_sheet_rows(ws, header_row=1))
    conn.executemany(
        "INSERT INTO gl_head_days VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", rows
    )
    conn.execute("CREATE INDEX idx_gl_head_days_lot ON gl_head_days(lot)")
    return len(rows)


def build_gl_head_movements(conn: sqlite3.Connection, wb) -> int:
    conn.execute("DROP TABLE IF EXISTS gl_head_movements")
    conn.execute(
        """
        CREATE TABLE gl_head_movements (
            lot             TEXT,
            profit_center   TEXT,
            date            TEXT,
            month_end       TEXT,
            week_end        TEXT,
            txn_number      TEXT,
            offset_account  TEXT,
            movement_type   TEXT,
            head            INTEGER,
            lbs             REAL,
            amount          REAL,
            dollar_per_head REAL,
            notes           TEXT,
            source_file     TEXT
        )
        """
    )
    ws = wb["Data_Head"]
    rows = list(read_sheet_rows(ws, header_row=1))
    conn.executemany(
        "INSERT INTO gl_head_movements VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows
    )
    conn.execute("CREATE INDEX idx_gl_head_movements_lot ON gl_head_movements(lot)")
    return len(rows)


def build_gl_account_map(conn: sqlite3.Connection) -> int:
    conn.execute("DROP TABLE IF EXISTS gl_account_map")
    conn.execute(
        """
        CREATE TABLE gl_account_map (
            acct           INTEGER,
            account        TEXT,
            account_label  TEXT,
            statement      TEXT,
            report_section TEXT,
            report_line    TEXT,
            group_name     TEXT,
            sign           INTEGER,
            notes          TEXT
        )
        """
    )
    wb = openpyxl.load_workbook(ACCOUNT_MAP_XLSX, data_only=True, read_only=True)
    ws = wb["Account Map"]
    header_row = find_header_row(ws, "Acct")  # verified to be row 4 in the real file
    rows = list(read_sheet_rows(ws, header_row=header_row))
    conn.executemany("INSERT INTO gl_account_map VALUES (?,?,?,?,?,?,?,?,?)", rows)
    return len(rows)


# ---------------------------------------------------------------------------
# Part 2: master_lot_schedule / master_crop_schedule, live from Supabase
# ---------------------------------------------------------------------------
# Column order/names mirror Unit Economics Reporting/supabase_sync.py's
# MASTER_LOT_SCHEDULE_COLUMN_MAP / MASTER_CROP_SCHEDULE_COLUMN_MAP values
# (the snake_case side) exactly - that script is the source of truth for
# these names, not retyped here independently. See
# docs/PROMPT - Master Schedule Unification.md §1 for the full DDL history.

MASTER_LOT_SCHEDULE_COLUMNS = [
    "lot", "profit_center", "status", "production_year", "date_in", "last_activity",
    "books_through", "head_in", "head_sold", "head_dead", "head_transferred_out",
    "head_on_hand", "head_days", "avg_dof", "lbs_in", "avg_wt_in", "cost_in_dollars",
    "cost_in_dollars_per_head", "head_data", "has_app_data", "app_sub_lots",
    "head_in_app", "head_current_app", "avg_weight_in_app",
    "projected_current_weight_app", "adg_used", "adg_source", "anchor_type",
    "anchor_date", "days_since_anchor", "weight_stale_over_60d", "crosswalk_flag",
    "display_name", "target_adg", "market_dollars_per_cwt", "target_out_date",
    "budget_cost_per_head", "use_for_benchmark", "feed_type", "location_type",
    "state", "interest", "death_loss", "slide", "premium", "action", "notes",
]

MASTER_CROP_SCHEDULE_COLUMNS = [
    "crop_lot", "profit_center", "status", "production_year", "date_in",
    "last_activity", "books_through", "direct_cost_dollars", "indirect_cost_dollars",
    "total_cost_dollars", "revenue_dollars", "net_dollars", "display_name", "acres",
    "yield_quantity", "yield_unit", "action", "notes",
]


def build_master_lot_schedule(conn: sqlite3.Connection) -> int:
    conn.execute("DROP TABLE IF EXISTS master_lot_schedule")
    conn.execute(
        f"""
        CREATE TABLE master_lot_schedule (
            {", ".join(f"{c} TEXT" if c not in _MASTER_LOT_SCHEDULE_NUMERIC else f"{c} REAL" for c in MASTER_LOT_SCHEDULE_COLUMNS)},
            PRIMARY KEY (lot)
        )
        """
    )
    rows = fetch_supabase_table("master_lot_schedule")
    conn.executemany(
        f"INSERT INTO master_lot_schedule ({', '.join(MASTER_LOT_SCHEDULE_COLUMNS)}) "
        f"VALUES ({', '.join('?' for _ in MASTER_LOT_SCHEDULE_COLUMNS)})",
        [tuple(r.get(c) for c in MASTER_LOT_SCHEDULE_COLUMNS) for r in rows],
    )
    return len(rows)


def build_master_crop_schedule(conn: sqlite3.Connection) -> int:
    conn.execute("DROP TABLE IF EXISTS master_crop_schedule")
    conn.execute(
        f"""
        CREATE TABLE master_crop_schedule (
            {", ".join(f"{c} TEXT" if c not in _MASTER_CROP_SCHEDULE_NUMERIC else f"{c} REAL" for c in MASTER_CROP_SCHEDULE_COLUMNS)},
            PRIMARY KEY (crop_lot)
        )
        """
    )
    rows = fetch_supabase_table("master_crop_schedule")
    conn.executemany(
        f"INSERT INTO master_crop_schedule ({', '.join(MASTER_CROP_SCHEDULE_COLUMNS)}) "
        f"VALUES ({', '.join('?' for _ in MASTER_CROP_SCHEDULE_COLUMNS)})",
        [tuple(r.get(c) for c in MASTER_CROP_SCHEDULE_COLUMNS) for r in rows],
    )
    return len(rows)


_MASTER_LOT_SCHEDULE_NUMERIC = {
    "production_year", "head_in", "head_sold", "head_dead", "head_transferred_out",
    "head_on_hand", "head_days", "avg_dof", "lbs_in", "avg_wt_in", "cost_in_dollars",
    "cost_in_dollars_per_head", "head_in_app", "head_current_app",
    "avg_weight_in_app", "projected_current_weight_app", "adg_used",
    "days_since_anchor", "target_adg", "market_dollars_per_cwt",
    "budget_cost_per_head", "interest", "death_loss", "slide", "premium",
}
_MASTER_CROP_SCHEDULE_NUMERIC = {
    "production_year", "direct_cost_dollars", "indirect_cost_dollars",
    "total_cost_dollars", "revenue_dollars", "net_dollars", "acres", "yield_quantity",
}


# ---------------------------------------------------------------------------
# Part 3: app-native tables, copied verbatim from the (separate) Supabase
# snapshot behind John's field app
# ---------------------------------------------------------------------------

RANCH_SQLITE = Path(
    r"C:\Users\UserTwo\Box\Working\Reagan Ranch\Supabase Connection\data\ranch.sqlite"
)

# The exact list of Supabase app tables to copy verbatim (same table name,
# same columns) into dev.sqlite. This is a small subset of the ~120 tables
# in the full Supabase snapshot - only the ones this dashboard needs.
APP_NATIVE_TABLES = [
    "lots",
    "lot_status",
    "invoices",
    "sales",
    "lot_events",
    "lot_daily_head",
    "lot_weight_anchor",
    "lot_realized_adg",
    "market_quotes",
    "positions",
    "position_lot_links",
    "hedge_coverage_by_month",
    "lot_budgets",
    "delivery_receipts",
    "shipments",
]


def build_app_native_tables(conn: sqlite3.Connection) -> dict[str, int]:
    """Attach the Supabase snapshot sqlite file and copy the wanted tables
    over using their own real CREATE TABLE statements (introspected from
    sqlite_master, not assumed), so column names/types are exactly as they
    exist in the source.
    """
    conn.execute("ATTACH DATABASE ? AS src", (str(RANCH_SQLITE),))
    counts: dict[str, int] = {}
    try:
        cur = conn.cursor()
        for table in APP_NATIVE_TABLES:
            cur.execute(
                "SELECT sql FROM src.sqlite_master WHERE type='table' AND name=?",
                (table,),
            )
            row = cur.fetchone()
            if row is None:
                raise ValueError(f"Table {table!r} not found in source ranch.sqlite")
            create_sql = row[0]

            conn.execute(f"DROP TABLE IF EXISTS main.{table}")
            # The captured DDL already says `CREATE TABLE "table_name" (...)`,
            # so executing it verbatim recreates the exact same schema in
            # dev.sqlite (main schema, since we didn't qualify with src.).
            conn.execute(create_sql)
            conn.execute(f"INSERT INTO main.{table} SELECT * FROM src.{table}")

            cur.execute(f"SELECT COUNT(*) FROM main.{table}")
            counts[table] = cur.fetchone()[0]
        # DETACH requires no open transaction against the attached database.
        conn.commit()
    finally:
        conn.execute("DETACH DATABASE src")
    return counts


# ---------------------------------------------------------------------------
# Part 4: crosswalk
# ---------------------------------------------------------------------------

HANDOFF_ETL_DIR = Path(
    r"C:\Users\UserTwo\Box\Working\Reagan Ranch"
    r"\2026-09-11 JFR Position Desk Data Layer - Handoff\etl"
)
CROSSWALK_CSV = HANDOFF_ETL_DIR / "crosswalk_seed.csv"


def build_lot_crosswalk(conn: sqlite3.Connection) -> int:
    conn.execute("DROP TABLE IF EXISTS lot_crosswalk")
    conn.execute(
        """
        CREATE TABLE lot_crosswalk (
            app_lot_number   TEXT,
            app_lot_id       TEXT,
            gl_lot           TEXT,
            profit_center    TEXT,
            match_type       TEXT,
            decision_needed  TEXT,
            note             TEXT
        )
        """
    )
    with open(CROSSWALK_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = [
            (
                csv_value(r["app_lot_number"]),
                csv_value(r["app_lot_id"]),
                csv_value(r["gl_lot"]),
                csv_value(r["profit_center"]),
                csv_value(r["match_type"]),
                csv_value(r["decision_needed"]),
                csv_value(r["note"]),
            )
            for r in reader
        ]
    conn.executemany("INSERT INTO lot_crosswalk VALUES (?,?,?,?,?,?,?)", rows)
    return len(rows)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DEV_DB_PATH)
    conn.execute("PRAGMA foreign_keys = OFF")  # plain copy, no FK enforcement needed

    counts: dict[str, int] = {}

    unit_econ_xlsx = find_latest_unit_econ_workbook()
    print(f"Reading GL workbook: {unit_econ_xlsx.name}")
    wb = openpyxl.load_workbook(unit_econ_xlsx, data_only=True, read_only=True)
    counts["gl_transactions"] = build_gl_transactions(conn, wb)
    counts["gl_head_days"] = build_gl_head_days(conn, wb)
    counts["gl_head_movements"] = build_gl_head_movements(conn, wb)
    wb.close()

    print("Reading GL reference workbook (Account Map)")
    counts["gl_account_map"] = build_gl_account_map(conn)

    print(f"Reading master_lot_schedule / master_crop_schedule from Supabase ({SUPABASE_URL})")
    counts["master_lot_schedule"] = build_master_lot_schedule(conn)
    counts["master_crop_schedule"] = build_master_crop_schedule(conn)

    print(f"Copying app-native tables from {RANCH_SQLITE.name}")
    counts.update(build_app_native_tables(conn))

    print("Reading crosswalk CSV")
    counts["lot_crosswalk"] = build_lot_crosswalk(conn)

    conn.commit()

    print("\nRow counts:")
    for table, count in counts.items():
        print(f"  {table:<28} {count}")

    conn.close()
    print(f"\nDone. Wrote {DEV_DB_PATH}")


if __name__ == "__main__":
    main()

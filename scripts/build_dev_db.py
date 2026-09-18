"""
build_dev_db.py
================

Builds the JFR Ranch Dashboard development SQLite database
(`web/data/dev.sqlite`) from the REAL source files listed below.

This script is idempotent: every table it manages is dropped and
recreated on each run, so `python build_dev_db.py` always produces a
byte-for-byte-equivalent database from the same source files.

There are three families of output tables (see `web/data/README.md`
for the full narrative, including known data-quality caveats):

1. `gl_*` tables      - derived from the CenterPoint General Ledger /
                         "Unit Economics Reporting" Excel pipeline.
                         Real DOLLAR figures.
2. App-native tables  - copied verbatim (same name, same columns) from
                         a snapshot of the client's Supabase cattle
                         management app. Real HEAD COUNTS, WEIGHTS,
                         DATES, MARKET QUOTES, HEDGE POSITIONS.
3. `lot_crosswalk` /
   `lot_attrs_app_cohort` - bridge/reference tables tying the two
                         systems together (they do NOT share a lot
                         identity - see README).

No table in this script is invented or backfilled: every row here is
copied straight out of one of the real source files below. Where a
source file didn't match what an earlier scoping pass assumed, this
script uses what actually exists and the discrepancy is called out in
a comment at the point it was discovered (also summarized in the
README).

Requires: Python 3.14 stdlib (sqlite3, csv, datetime, pathlib) plus
`openpyxl` for reading .xlsx files. No pandas/bcrypt dependency.
"""

from __future__ import annotations

import csv
import datetime
import sqlite3
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
LOT_MASTER_XLSX = GL_DATABASE_DIR / "Lot Master.xlsx"
MASTER_LOT_SCHEDULE_XLSX = GL_DATABASE_DIR / "Master Lot Schedule.xlsx"

# --- Source 2: Supabase cattle-management app snapshot ---------------------
RANCH_SQLITE = Path(
    r"C:\Users\UserTwo\Box\Working\Reagan Ranch\Supabase Connection\data\ranch.sqlite"
)

# --- Source 3: crosswalk + app-cohort attribute rollup handoff -------------
HANDOFF_ETL_DIR = Path(
    r"C:\Users\UserTwo\Box\Working\Reagan Ranch"
    r"\2026-09-11 JFR Position Desk Data Layer - Handoff\etl"
)
CROSSWALK_CSV = HANDOFF_ETL_DIR / "crosswalk_seed.csv"
LOT_ATTRS_CSV = HANDOFF_ETL_DIR / "out" / "App_LotAttrs.csv"

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


def csv_number(v):
    """Best-effort numeric cast for CSV cells: int, then float, else NULL/text."""
    v = csv_value(v)
    if v is None:
        return None
    try:
        return int(v)
    except ValueError:
        pass
    try:
        return float(v)
    except ValueError:
        return v


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


def build_gl_lot_summary(conn: sqlite3.Connection, wb) -> int:
    conn.execute("DROP TABLE IF EXISTS gl_lot_summary")
    conn.execute(
        """
        CREATE TABLE gl_lot_summary (
            lot                       TEXT PRIMARY KEY,
            profit_center             TEXT,
            status                    TEXT,
            production_year           INTEGER,
            date_in                   TEXT,
            last_activity             TEXT,
            books_through             TEXT,
            head_in                   INTEGER,
            head_sold                 INTEGER,
            head_dead                 INTEGER,
            head_transferred_out      INTEGER,
            head_on_hand              INTEGER,
            head_days                 REAL,
            avg_dof                   REAL,
            lbs_in                    REAL,
            avg_wt_in                 REAL,
            cost_in_dollars           REAL,
            cost_in_dollars_per_head  REAL,
            target_adg                REAL,
            market_dollars_per_cwt    REAL,
            target_out_date           TEXT,
            use_for_benchmark         TEXT,
            head_data                 TEXT,
            notes                     TEXT
        )
        """
    )
    ws = wb["Data_Lots"]
    rows = list(read_sheet_rows(ws, header_row=1))
    # Sanity check baked into the build: `lot` must be unique, since it is
    # used as the primary key and as the join target from lot_crosswalk.
    lots_seen = [r[0] for r in rows]
    assert len(lots_seen) == len(set(lots_seen)), (
        "gl_lot_summary.lot is not unique - primary key assumption violated"
    )
    conn.executemany(
        "INSERT INTO gl_lot_summary VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        rows,
    )
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


def build_gl_lot_master(conn: sqlite3.Connection) -> int:
    conn.execute("DROP TABLE IF EXISTS gl_lot_master")
    conn.execute(
        """
        CREATE TABLE gl_lot_master (
            lot                    TEXT,
            display_name           TEXT,
            target_adg             REAL,
            market_dollars_per_cwt REAL,
            target_out_date        TEXT,
            budget_cost_per_head   REAL,
            use_for_benchmark      TEXT,
            notes                  TEXT
        )
        """
    )
    wb = openpyxl.load_workbook(LOT_MASTER_XLSX, data_only=True, read_only=True)
    ws = wb["Lot Master"]
    header_row = find_header_row(ws, "Lot")  # verified to be row 4 in the real file
    rows = list(read_sheet_rows(ws, header_row=header_row))
    conn.executemany("INSERT INTO gl_lot_master VALUES (?,?,?,?,?,?,?,?)", rows)
    return len(rows)


def build_gl_master_lot_schedule(conn: sqlite3.Connection) -> int:
    conn.execute("DROP TABLE IF EXISTS gl_master_lot_schedule")
    conn.execute(
        """
        CREATE TABLE gl_master_lot_schedule (
            lot            TEXT,
            profit_center  TEXT,
            feed_type      TEXT,
            location_type  TEXT,
            state          TEXT,
            head_on_feed   INTEGER,
            adg            REAL,
            interest       REAL,
            death_loss     REAL,
            slide          REAL,
            premium        REAL,
            status         TEXT,
            latest_gl_date TEXT,
            action         TEXT
        )
        """
    )
    wb = openpyxl.load_workbook(MASTER_LOT_SCHEDULE_XLSX, data_only=True, read_only=True)
    ws = wb["Sheet1"]
    header_row = find_header_row(ws, "Lot")  # verified to be row 1 in the real file
    rows = list(read_sheet_rows(ws, header_row=header_row))
    conn.executemany(
        "INSERT INTO gl_master_lot_schedule VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows
    )
    return len(rows)


# ---------------------------------------------------------------------------
# Part 2: app-native tables, copied verbatim from the Supabase snapshot
# ---------------------------------------------------------------------------

def build_app_native_tables(conn: sqlite3.Connection) -> dict[str, int]:
    """Attach the Supabase snapshot sqlite file and copy the wanted tables
    over using their own real CREATE TABLE statements (introspected from
    sqlite_master, not assumed), so column names/types are exactly as they
    exist in the source - a future Supabase sync can map onto these 1:1.
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
# Part 3: crosswalk + app-cohort attribute rollup
# ---------------------------------------------------------------------------

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


def build_lot_attrs_app_cohort(conn: sqlite3.Connection) -> int | None:
    """Import App_LotAttrs.csv as-is (grain = one row per app cohort/sub-lot).
    Per the task brief, if this file is missing we skip the table entirely
    rather than inventing data - but it DOES exist in this handoff, so we
    import it.
    """
    if not LOT_ATTRS_CSV.exists():
        return None

    conn.execute("DROP TABLE IF EXISTS lot_attrs_app_cohort")
    conn.execute(
        """
        CREATE TABLE lot_attrs_app_cohort (
            lot                      TEXT,
            app_lot                  TEXT,
            arrival_date             TEXT,
            weighted_arrival_date    TEXT,
            head_in                  INTEGER,
            head_current             INTEGER,
            head_pending_invoice     INTEGER,
            avg_weight_in            REAL,
            projected_current_weight REAL,
            adg_used                 REAL,
            adg_source               TEXT,
            anchor_type              TEXT,
            anchor_date              TEXT,
            days_since_anchor        REAL,
            weight_stale_over_60d    TEXT,
            days_on_feed             REAL,
            is_feed_pen              TEXT,
            source_file              TEXT,
            crosswalk_flag           TEXT
        )
        """
    )
    with open(LOT_ATTRS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = [
            (
                csv_value(r["Lot"]),
                csv_value(r["App Lot"]),
                csv_value(r["Arrival Date"]),
                csv_value(r["Weighted Arrival Date"]),
                csv_number(r["Head In"]),
                csv_number(r["Head Current"]),
                csv_number(r["Head Pending Invoice"]),
                csv_number(r["Avg Weight In"]),
                csv_number(r["Projected Current Weight"]),
                csv_number(r["ADG Used"]),
                csv_value(r["ADG Source"]),
                csv_value(r["Anchor Type"]),
                csv_value(r["Anchor Date"]),
                csv_number(r["Days Since Anchor"]),
                csv_value(r["Weight Stale >60d"]),
                csv_number(r["Days On Feed"]),
                csv_value(r["Is Feed Pen"]),
                csv_value(r["Source File"]),
                csv_value(r["Crosswalk Flag"]),
            )
            for r in reader
        ]
    conn.executemany(
        "INSERT INTO lot_attrs_app_cohort VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        rows,
    )
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
    counts["gl_lot_summary"] = build_gl_lot_summary(conn, wb)
    counts["gl_head_days"] = build_gl_head_days(conn, wb)
    counts["gl_head_movements"] = build_gl_head_movements(conn, wb)
    wb.close()

    print("Reading GL reference workbooks (Account Map / Lot Master / Master Lot Schedule)")
    counts["gl_account_map"] = build_gl_account_map(conn)
    counts["gl_lot_master"] = build_gl_lot_master(conn)
    counts["gl_master_lot_schedule"] = build_gl_master_lot_schedule(conn)

    print(f"Copying app-native tables from {RANCH_SQLITE.name}")
    counts.update(build_app_native_tables(conn))

    print("Reading crosswalk + app-cohort attribute CSVs")
    counts["lot_crosswalk"] = build_lot_crosswalk(conn)
    lot_attrs_count = build_lot_attrs_app_cohort(conn)
    if lot_attrs_count is None:
        print("  NOTE: App_LotAttrs.csv not found - skipping lot_attrs_app_cohort table.")
    else:
        counts["lot_attrs_app_cohort"] = lot_attrs_count

    conn.commit()

    print("\nRow counts:")
    for table, count in counts.items():
        print(f"  {table:<28} {count}")

    conn.close()
    print(f"\nDone. Wrote {DEV_DB_PATH}")


if __name__ == "__main__":
    main()

import Link from "next/link";
import { listGlLots } from "@/lib/data/cost-of-gain";
import { getDb } from "@/lib/db";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

interface ScheduleRow {
  lot: string;
  feed_type: string | null;
  location_type: string | null;
  state: string | null;
  interest: number | null;
  death_loss: number | null;
  slide: number | null;
  premium: number | null;
  latest_gl_date: string | null;
  action: string | null;
}

export default async function LotsPage() {
  const lots = listGlLots();
  const db = getDb();
  const schedule = db
    .prepare(
      `SELECT lot, feed_type, location_type, state, interest, death_loss, slide, premium, latest_gl_date, action
       FROM gl_master_lot_schedule`
    )
    .all() as unknown as ScheduleRow[];
  const scheduleByLot = new Map(schedule.map((s) => [s.lot, s]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Master Lot Schedule</h1>
        <p className="text-sm text-muted-foreground">
          Every lot JFR has ever run, with the hand-maintained attributes (feed type, location, interest, death
          loss %, slide, premium) that don&apos;t live in the GL.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lot</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Feed type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">Interest</TableHead>
              <TableHead className="text-right">Death loss</TableHead>
              <TableHead>Latest GL date</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lots.map((l) => {
              const s = scheduleByLot.get(l.lot);
              return (
                <TableRow key={l.lot}>
                  <TableCell className="font-medium">
                    <Link href={`/lots/${encodeURIComponent(l.lot)}`} className="hover:underline">
                      {l.lot}
                    </Link>
                  </TableCell>
                  <TableCell>{l.status ?? "—"}</TableCell>
                  <TableCell>{s?.feed_type ?? "—"}</TableCell>
                  <TableCell>{s?.location_type ?? "—"}</TableCell>
                  <TableCell>{s?.state ?? "—"}</TableCell>
                  <TableCell className="text-right">{s?.interest != null ? `${formatNumber(s.interest)}%` : "—"}</TableCell>
                  <TableCell className="text-right">{s?.death_loss != null ? `${formatNumber(s.death_loss)}%` : "—"}</TableCell>
                  <TableCell>{formatDate(s?.latest_gl_date)}</TableCell>
                  <TableCell className="text-muted-foreground">{s?.action ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

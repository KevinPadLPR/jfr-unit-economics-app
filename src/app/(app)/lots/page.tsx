import Link from "next/link";
import { listGlLots } from "@/lib/data/cost-of-gain";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LotsPage() {
  // master_lot_schedule already carries feed_type/location_type/state/
  // interest/death_loss/slide/premium/action on the same row as everything
  // else listGlLots() returns — no second query (docs/PROMPT - Master
  // Schedule Unification.md §3). `latest_gl_date` is now `last_activity`.
  const lots = listGlLots();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Master Lot Schedule</h1>
        <p className="text-sm text-muted-foreground">
          Every lot JFR has run, with the details we track by hand: feed type, location, interest, and death loss.
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
              <TableHead>Last activity</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lots.map((l) => (
              <TableRow key={l.lot}>
                <TableCell className="font-medium">
                  <Link href={`/lots/${encodeURIComponent(l.lot)}`} className="hover:underline">
                    {l.lot}
                  </Link>
                </TableCell>
                <TableCell>{l.status ?? "—"}</TableCell>
                <TableCell>{l.feed_type ?? "—"}</TableCell>
                <TableCell>{l.location_type ?? "—"}</TableCell>
                <TableCell>{l.state ?? "—"}</TableCell>
                <TableCell className="text-right">{l.interest != null ? `${formatNumber(l.interest)}%` : "—"}</TableCell>
                <TableCell className="text-right">{l.death_loss != null ? `${formatNumber(l.death_loss)}%` : "—"}</TableCell>
                <TableCell>{formatDate(l.last_activity)}</TableCell>
                <TableCell className="text-muted-foreground">{l.action ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

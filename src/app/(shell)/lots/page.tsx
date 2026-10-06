import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

interface LotStatusRow {
  lot_id: string;
  lot_number: string;
  closed_at: string | null;
  head_current: number | null;
  avg_weight_in: number | null;
  projected_current_weight: number | null;
  days_on_feed: number | null;
  source: string | null;
  sex_class: string | null;
  adg_used: number | null;
  adg_source: string | null;
}

/**
 * The client app's own operational lot list (navLots, index.html:1178-1199) -- per-lot
 * purchases/health/moves/sales/closeout detail in the vanilla app, a plain list here in
 * Phase 1 (no drill-in detail page yet, that's a later phase). NOT the same concept as
 * /dashboard/lots (the Unit Economics "Master Lot Schedule" GL rollup, ue_master_lot_schedule)
 * -- this reads the client's own native lots/lot_status tables directly.
 */
export default async function LotsPage() {
  const supabase = await createClient();
  const [{ data: statusRows, error: statusError }, { data: lotRows, error: lotError }] = await Promise.all([
    supabase
      .from("lot_status")
      .select(
        "lot_id, lot_number, closed_at, head_current, avg_weight_in, projected_current_weight, days_on_feed, source, sex_class, adg_used, adg_source"
      )
      .order("lot_number", { ascending: true }),
    supabase.from("lots").select("id, is_test"),
  ]);
  if (statusError) throw statusError;
  if (lotError) throw lotError;

  const testLotIds = new Set((lotRows ?? []).filter((l) => l.is_test).map((l) => l.id));
  const lots = ((statusRows ?? []) as LotStatusRow[]).filter((r) => !testLotIds.has(r.lot_id));
  const open = lots.filter((l) => !l.closed_at);
  const closed = lots.filter((l) => l.closed_at);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Lots</h1>
        <p className="text-sm text-muted-foreground">Every lot on the books, open and closed.</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lot</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Sex class</TableHead>
              <TableHead className="text-right">Head current</TableHead>
              <TableHead className="text-right">Avg wt in</TableHead>
              <TableHead className="text-right">Est. wt today</TableHead>
              <TableHead className="text-right">Days on feed</TableHead>
              <TableHead>ADG source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...open, ...closed].map((l) => (
              <TableRow key={l.lot_id}>
                <TableCell className="font-medium">{l.lot_number}</TableCell>
                <TableCell>
                  <Badge variant={l.closed_at ? "neutral" : "good"}>{l.closed_at ? "Closed" : "Open"}</Badge>
                </TableCell>
                <TableCell>{l.source ?? "—"}</TableCell>
                <TableCell>{l.sex_class ?? "—"}</TableCell>
                <TableCell className="text-right">{l.head_current != null ? formatNumber(l.head_current) : "—"}</TableCell>
                <TableCell className="text-right">{l.avg_weight_in != null ? `${formatNumber(l.avg_weight_in)} lb` : "—"}</TableCell>
                <TableCell className="text-right">
                  {l.projected_current_weight != null ? `${formatNumber(l.projected_current_weight)} lb` : "—"}
                </TableCell>
                <TableCell className="text-right">{l.days_on_feed != null ? formatNumber(l.days_on_feed) : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{l.adg_source ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

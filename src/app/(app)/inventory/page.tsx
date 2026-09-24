import Link from "next/link";
import { getAvailableMonths, getInventorySnapshot } from "@/lib/data/inventory";
import { StatTile } from "@/components/stat-tile";
import { ReportUnavailableNotice } from "@/components/report-unavailable-notice";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from "@/components/ui/table";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { MonthPicker } from "./month-picker";
import { WaterfallChart } from "./waterfall-chart";
import { BalanceBarChart } from "./balance-bar-chart";

export const dynamic = "force-dynamic";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const months = getAvailableMonths();
  const { month: monthParam } = await searchParams;
  const monthEnd = monthParam && months.includes(monthParam) ? monthParam : months[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            How many head you had, what moved, and where everything ended up for the month.
          </p>
        </div>
        {monthEnd && <MonthPicker months={months} current={monthEnd} />}
      </div>

      {!monthEnd ? (
        <ReportUnavailableNotice detail="No head-count history yet." />
      ) : (
        <InventoryBody monthEnd={monthEnd} />
      )}
    </div>
  );
}

function InventoryBody({ monthEnd }: { monthEnd: string }) {
  const snapshot = getInventorySnapshot(monthEnd);
  const { totals, rows, byLocation } = snapshot;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Ending head count" value={formatNumber(totals.ending)} provenance="measured" />
        <StatTile label="Purchased" value={formatNumber(totals.purchased)} provenance="measured" />
        <StatTile label="Born" value={formatNumber(totals.born)} provenance="measured" />
        <StatTile label="Transfers in / out" value={`${formatNumber(totals.transferIn)} / ${formatNumber(totals.transferOut)}`} provenance="measured" />
        <StatTile label="Sold" value={formatNumber(totals.sold)} provenance="measured" />
        <StatTile label="Died" value={formatNumber(totals.died)} provenance="measured" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WaterfallChart totals={totals} />
        <BalanceBarChart rows={rows} />
      </div>

      <div className="flex flex-col gap-4">
        {byLocation.map((group) => (
          <Card key={group.location}>
            <CardHeader>
              <CardTitle className="text-base">{group.location}</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot</TableHead>
                  <TableHead className="text-right">Beginning</TableHead>
                  <TableHead className="text-right">Purch.</TableHead>
                  <TableHead className="text-right">Born</TableHead>
                  <TableHead className="text-right">Trans. In</TableHead>
                  <TableHead className="text-right">Trans. Out</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Died</TableHead>
                  <TableHead className="text-right">Ending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.rows.map((row) => (
                  <TableRow key={row.lot}>
                    <TableCell className="font-medium">
                      <Link href={`/lots/${encodeURIComponent(row.lot)}`} className="hover:underline">
                        {row.lot}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(row.beginning)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.purchased)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.born)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.transferIn)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.transferOut)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.sold)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.died)}</TableCell>
                    <TableCell className="text-right font-medium">{formatNumber(row.ending)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{formatNumber(group.totals.beginning)}</TableCell>
                  <TableCell className="text-right">{formatNumber(group.totals.purchased)}</TableCell>
                  <TableCell className="text-right">{formatNumber(group.totals.born)}</TableCell>
                  <TableCell className="text-right">{formatNumber(group.totals.transferIn)}</TableCell>
                  <TableCell className="text-right">{formatNumber(group.totals.transferOut)}</TableCell>
                  <TableCell className="text-right">{formatNumber(group.totals.sold)}</TableCell>
                  <TableCell className="text-right">{formatNumber(group.totals.died)}</TableCell>
                  <TableCell className="text-right">{formatNumber(group.totals.ending)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Card>
        ))}
      </div>
    </div>
  );
}

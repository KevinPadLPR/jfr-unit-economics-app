import { getMarketPosition, getLatestFeederSettle } from "@/lib/data/market-position";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ProvenanceBadge } from "@/components/provenance-badge";
import { ReportUnavailableNotice } from "@/components/report-unavailable-notice";
import { formatMoney, formatNumber, formatDate } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MarketPositionPage() {
  const rows = getMarketPosition();
  const settle = getLatestFeederSettle();

  const totalMarked = rows.reduce((s, r) => s + (r.markedValue ?? 0), 0);
  const totalCost = rows.reduce((s, r) => s + (r.costBasis ?? 0), 0);
  const totalUnrealized = totalMarked - totalCost;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Market Position</h1>
        <p className="text-sm text-muted-foreground">Mark-to-market for open lots, at the latest CME feeder-cattle settle.</p>
      </div>

      {settle ? (
        <p className="text-xs text-muted-foreground">
          Latest feeder-cattle settle: <span className="font-medium text-foreground">${settle.settle.toFixed(2)}/cwt</span>{" "}
          as of {formatDate(settle.quoteDate)}.
        </p>
      ) : (
        <ReportUnavailableNotice detail="No market quotes available." />
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lot</TableHead>
              <TableHead className="text-right">Head on hand</TableHead>
              <TableHead className="text-right">Est. wt / head</TableHead>
              <TableHead className="text-right">Cost basis</TableHead>
              <TableHead className="text-right">Marked value</TableHead>
              <TableHead className="text-right">Unrealized</TableHead>
              <TableHead>Weight source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.lot}>
                <TableCell className="font-medium">
                  <Link href={`/lots/${encodeURIComponent(r.lot)}`} className="hover:underline">
                    {r.lot}
                  </Link>
                  {r.lightCalfCaveat && (
                    <Badge variant="warning" className="ml-2">
                      light-calf mark
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">{formatNumber(r.headOnHand)}</TableCell>
                <TableCell className="text-right">{formatNumber(r.projectedWeightPerHead)} lb</TableCell>
                <TableCell className="text-right">{formatMoney(r.costBasis)}</TableCell>
                <TableCell className="text-right">{formatMoney(r.markedValue)}</TableCell>
                <TableCell
                  className={`text-right font-medium ${
                    (r.unrealized ?? 0) >= 0 ? "text-[#3f5c1f]" : "text-[#8a3115]"
                  }`}
                >
                  {formatMoney(r.unrealized)}
                </TableCell>
                <TableCell>
                  <ProvenanceBadge provenance={r.weightProvenance} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3}>Total</TableCell>
              <TableCell className="text-right">{formatMoney(totalCost)}</TableCell>
              <TableCell className="text-right">{formatMoney(totalMarked)}</TableCell>
              <TableCell className="text-right">{formatMoney(totalUnrealized)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Every mark uses the same latest feeder-cattle settle regardless of each lot&apos;s actual target ship
        month, and light calves are marked against a contract sized for 700-800 lb cattle — both are known
        simplifications until a real contract-month and own-basis table are built (see docs/brand-palette.md and
        the project README for what&apos;s next).
      </p>
    </div>
  );
}

import { notFound } from "next/navigation";
import { getLotSheet } from "@/lib/data/lot-sheet";
import { listGlLots } from "@/lib/data/cost-of-gain";
import { getLotFlow } from "@/lib/data/lot-flow";
import { getMonthlyHeadSeries, getWeeklyCostSeries } from "@/lib/data/gl";
import { StatTile } from "@/components/stat-tile";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatNumber, formatDate, formatPct } from "@/lib/format";
import { LotFlowChart } from "./lot-flow-chart";
import { MonthlyHeadChart } from "./monthly-head-chart";
import { WeeklyCostChart } from "../../cost-of-gain/weekly-cost-chart";
import { LotDetailPicker } from "./lot-detail-picker";

export const dynamic = "force-dynamic";

const MOVEMENT_BADGE: Record<string, "good" | "neutral" | "critical" | "warning"> = {
  Purchase: "good",
  "Transfer In": "good",
  Sold: "neutral",
  "Transfer Out": "neutral",
  Died: "critical",
  Adjustment: "warning",
};

export default async function LotSheetPage({ params }: { params: Promise<{ lot: string }> }) {
  const { lot: lotParam } = await params;
  const lot = decodeURIComponent(lotParam);
  const sheet = getLotSheet(lot);
  if (!sheet) notFound();

  const { summary } = sheet;
  const deathPct = summary.head_in ? ((summary.head_dead ?? 0) / summary.head_in) * 100 : null;
  const flow = getLotFlow(lot, summary.head_on_hand ?? 0);
  const monthlyHead = getMonthlyHeadSeries(lot);
  const weeklyCost = getWeeklyCostSeries(lot);
  const allLots = listGlLots().map((l) => ({ lot: l.lot, status: l.status }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{sheet.lot}</h1>
          <p className="text-sm text-muted-foreground">
            {summary.profit_center} · {sheet.scheduleFeedType ?? "feed type n/a"} ·{" "}
            {sheet.scheduleLocationType ?? "location n/a"} {sheet.scheduleState ? `· ${sheet.scheduleState}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LotDetailPicker lots={allLots} current={lot} />
          <Badge variant={summary.status?.toLowerCase() === "open" ? "good" : "neutral"}>{summary.status ?? "Unknown"}</Badge>
        </div>
      </div>

      {sheet.crosswalk.decisionNeeded && (
        <p className="rounded-md border border-[color-mix(in_srgb,var(--status-warning)_50%,var(--border))] bg-[color-mix(in_srgb,var(--status-warning)_8%,white)] px-3 py-2 text-xs text-[#5c3d00]">
          We need to confirm which app record this lot matches before its head/weight numbers can be trusted: {sheet.crosswalk.note}
        </p>
      )}

      {/* Header stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <StatTile label="Date In" value={formatDate(summary.date_in)} />
        <StatTile label="Avg DOF" value={formatNumber(summary.avg_dof)} />
        <StatTile label="Head On Hand" value={formatNumber(summary.head_on_hand)} />
        <StatTile label="Target Out Date" value={formatDate(summary.target_out_date)} />
        <StatTile label="Books Through" value={formatDate(summary.books_through)} />
        <StatTile label="Last Activity" value={formatDate(summary.last_activity)} />
      </div>

      {/* Cattle flow */}
      {flow && <LotFlowChart lot={lot} flow={flow} />}

      {/* Monthly + weekly trends */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MonthlyHeadChart data={monthlyHead} />
        <WeeklyCostChart data={weeklyCost} />
      </div>

      {/* Deads */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deads</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-8">
          <div>
            <p className="text-xs text-muted-foreground">Total dead</p>
            <p className="text-lg font-semibold">{formatNumber(summary.head_dead)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Death %</p>
            <p className="text-lg font-semibold">{formatPct(deathPct)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
          <CardDescription>Every head movement and cost on this lot, in order.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Head</TableHead>
              <TableHead className="text-right">Weight</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">$/Head</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sheet.activity.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No activity recorded
                </TableCell>
              </TableRow>
            )}
            {sheet.activity.map((row, i) => (
              <TableRow key={i}>
                <TableCell>{formatDate(row.date)}</TableCell>
                <TableCell>
                  <Badge variant={row.category === "movement" ? (MOVEMENT_BADGE[row.type] ?? "neutral") : "outline"}>
                    {row.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{row.head != null ? formatNumber(row.head) : "—"}</TableCell>
                <TableCell className="text-right">{row.weight ? `${formatNumber(row.weight)} lb` : "—"}</TableCell>
                <TableCell className="text-right">{formatMoney(row.amount)}</TableCell>
                <TableCell className="text-right">{row.dollarsPerHead != null ? formatMoney(row.dollarsPerHead, { cents: true }) : "—"}</TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground" title={row.notes ?? undefined}>
                  {row.notes ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Expenses */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expenses</CardTitle>
          <CardDescription>Every dollar spent on this lot since day one.</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Line</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Per Head</TableHead>
              <TableHead className="text-right">Per Cwt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sheet.expenses.direct.map((line) => (
              <TableRow key={line.label}>
                <TableCell>{line.label}</TableCell>
                <TableCell className="text-right">{formatMoney(line.total)}</TableCell>
                <TableCell className="text-right">{formatMoney(line.perHead, { cents: true })}</TableCell>
                <TableCell className="text-right">{formatMoney(line.perCwt, { cents: true })}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-medium">
              <TableCell>{sheet.expenses.directTotal.label}</TableCell>
              <TableCell className="text-right">{formatMoney(sheet.expenses.directTotal.total)}</TableCell>
              <TableCell className="text-right">{formatMoney(sheet.expenses.directTotal.perHead, { cents: true })}</TableCell>
              <TableCell className="text-right">{formatMoney(sheet.expenses.directTotal.perCwt, { cents: true })}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{sheet.expenses.general.label}</TableCell>
              <TableCell className="text-right">{formatMoney(sheet.expenses.general.total)}</TableCell>
              <TableCell className="text-right">{formatMoney(sheet.expenses.general.perHead, { cents: true })}</TableCell>
              <TableCell className="text-right">{formatMoney(sheet.expenses.general.perCwt, { cents: true })}</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>{sheet.expenses.total.label}</TableCell>
              <TableCell className="text-right">{formatMoney(sheet.expenses.total.total)}</TableCell>
              <TableCell className="text-right">{formatMoney(sheet.expenses.total.perHead, { cents: true })}</TableCell>
              <TableCell className="text-right">{formatMoney(sheet.expenses.total.perCwt, { cents: true })}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      {/* Bottom line */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Total Outstanding Cost" value={formatMoney(sheet.outstandingCost)} provenance="measured" />
        <StatTile
          label="Market Value (on hand)"
          value={sheet.markedValueOnHand !== null ? formatMoney(sheet.markedValueOnHand) : "—"}
          provenance="modeled"
          delta={sheet.markedValueOnHand === null ? "Lot is closed or has no head on hand" : undefined}
        />
        <StatTile
          label="Estimated P/L"
          value={formatMoney(sheet.estimatedPL)}
          deltaTone={sheet.estimatedPL >= 0 ? "good" : "bad"}
          provenance="modeled"
        />
      </div>
    </div>
  );
}

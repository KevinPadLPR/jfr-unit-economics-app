"use client";

import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CATEGORICAL } from "@/lib/theme/colors";
import { formatNumber } from "@/lib/format";
import type { InventoryLotRow } from "@/lib/data/inventory";
import { cn } from "@/lib/utils";

type GroupBy = "lot" | "location" | "feed";

const GROUP_LABEL: Record<GroupBy, string> = { lot: "Lot", location: "Location", feed: "Feed type" };

function groupKey(row: InventoryLotRow, groupBy: GroupBy): string {
  if (groupBy === "lot") return row.lot;
  if (groupBy === "location") return row.locationType ?? "Unspecified";
  return row.feedType ?? "Unspecified";
}

export function BalanceBarChart({ rows }: { rows: InventoryLotRow[] }) {
  const [groupBy, setGroupBy] = useState<GroupBy>("location");

  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = groupKey(row, groupBy);
    totals.set(key, (totals.get(key) ?? 0) + row.ending);
  }
  const data = [...totals.entries()]
    .map(([name, ending]) => ({ name, ending }))
    .sort((a, b) => b.ending - a.ending);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Head on hand today</CardTitle>
          <CardDescription>Ending count for the month, grouped by {GROUP_LABEL[groupBy].toLowerCase()}.</CardDescription>
        </div>
        <div className="flex gap-1">
          {(["lot", "location", "feed"] as GroupBy[]).map((g) => (
            <Button
              key={g}
              type="button"
              variant="outline"
              className={cn("h-7 px-2 text-xs", groupBy === g && "bg-accent text-accent-foreground")}
              onClick={() => setGroupBy(g)}
            >
              {GROUP_LABEL[g]}
            </Button>
          ))}
        </div>
      </CardHeader>
      <div className="h-72 px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={groupBy === "lot" ? -45 : 0} textAnchor={groupBy === "lot" ? "end" : "middle"} height={groupBy === "lot" ? 60 : 30} />
            <YAxis tickFormatter={(v) => formatNumber(v)} width={60} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => [`${formatNumber(Number(value))} head`, "Ending"]} />
            <Bar dataKey="ending" fill={CATEGORICAL.steelBlue} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CATEGORICAL } from "@/lib/theme/colors";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type GroupBy = "feed" | "location";

interface Row {
  feedType: string | null;
  locationType: string | null;
  headOnHand: number | null;
}

export function HeadByGroupChart({ rows }: { rows: Row[] }) {
  const [groupBy, setGroupBy] = useState<GroupBy>("feed");

  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = (groupBy === "feed" ? row.feedType : row.locationType) ?? "Unspecified";
    totals.set(key, (totals.get(key) ?? 0) + (row.headOnHand ?? 0));
  }
  const data = [...totals.entries()].map(([name, headOnHand]) => ({ name, headOnHand })).sort((a, b) => b.headOnHand - a.headOnHand);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Head on hand today</CardTitle>
          <CardDescription>Every open lot&apos;s head count, grouped by {groupBy === "feed" ? "feed type" : "location"}.</CardDescription>
        </div>
        <div className="flex gap-1">
          <Button type="button" variant="outline" className={cn("h-7 px-2 text-xs", groupBy === "feed" && "bg-accent text-accent-foreground")} onClick={() => setGroupBy("feed")}>
            Feed type
          </Button>
          <Button type="button" variant="outline" className={cn("h-7 px-2 text-xs", groupBy === "location" && "bg-accent text-accent-foreground")} onClick={() => setGroupBy("location")}>
            Location
          </Button>
        </div>
      </CardHeader>
      <div className="h-64 px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => formatNumber(v)} width={50} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => [`${formatNumber(Number(value))} head`, "On hand"]} />
            <Bar dataKey="headOnHand" fill={CATEGORICAL.olive} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

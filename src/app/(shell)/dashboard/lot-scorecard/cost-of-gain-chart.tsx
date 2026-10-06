"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CATEGORICAL } from "@/lib/theme/colors";
import { formatPerLb } from "@/lib/format";
import type { ScorecardRow } from "@/lib/data/scorecard";

export function CostOfGainChart({ rows }: { rows: ScorecardRow[] }) {
  const data = rows
    .filter((r): r is ScorecardRow & { cogAllIn: number } => r.cogAllIn !== null)
    .sort((a, b) => b.cogAllIn - a.cogAllIn);

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cost of gain, all-in — by lot</CardTitle>
        <CardDescription>Highest cost per pound first, so you can spot which lots are expensive to run.</CardDescription>
      </CardHeader>
      <div className="h-80 px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="lot" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={70} />
            <YAxis tickFormatter={(v) => `$${v.toFixed(2)}`} width={55} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value) => [formatPerLb(Number(value)), "All-in"]} />
            <Bar dataKey="cogAllIn" fill={CATEGORICAL.rust} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

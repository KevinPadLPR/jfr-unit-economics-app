"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CATEGORICAL, DIVERGING } from "@/lib/theme/colors";
import { formatNumber } from "@/lib/format";
import type { InventoryTotals } from "@/lib/data/inventory";

interface Step {
  name: string;
  base: number;
  size: number;
  kind: "total" | "in" | "out";
  actual: number;
}

const COLOR: Record<Step["kind"], string> = {
  total: CATEGORICAL.steelBlue,
  in: DIVERGING.positive,
  out: DIVERGING.negative,
};

function buildSteps(totals: InventoryTotals): Step[] {
  const steps: Step[] = [{ name: "Beginning", base: 0, size: totals.beginning, kind: "total", actual: totals.beginning }];
  let running = totals.beginning;
  const deltas: [string, number][] = [
    ["Purchased", totals.purchased],
    ["Born", totals.born],
    ["Transfer In", totals.transferIn],
    ["Sold", -totals.sold],
    ["Died", -totals.died],
    ["Transfer Out", -totals.transferOut],
  ];
  for (const [name, delta] of deltas) {
    if (delta === 0) continue;
    const base = delta >= 0 ? running : running + delta;
    steps.push({ name, base, size: Math.abs(delta), kind: delta >= 0 ? "in" : "out", actual: delta });
    running += delta;
  }
  steps.push({ name: "Ending", base: 0, size: totals.ending, kind: "total", actual: totals.ending });
  return steps;
}

export function WaterfallChart({ totals }: { totals: InventoryTotals }) {
  const steps = buildSteps(totals);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Head count, month over month</CardTitle>
        <CardDescription>What you started the month with, what moved, and what you ended with.</CardDescription>
      </CardHeader>
      <div className="h-72 px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={steps} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis tickFormatter={(v) => formatNumber(v)} width={60} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(_value, _name, item) => [`${item.payload.actual >= 0 ? "+" : ""}${formatNumber(item.payload.actual)} head`, item.payload.name]}
              labelFormatter={() => ""}
            />
            <Bar dataKey="base" stackId="a" fill="transparent" />
            <Bar dataKey="size" stackId="a" radius={[3, 3, 0, 0]}>
              {steps.map((s) => (
                <Cell key={s.name} fill={COLOR[s.kind]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CATEGORICAL } from "@/lib/theme/colors";
import { formatMoney, formatDate } from "@/lib/format";
import type { MonthlyRanchCostPoint } from "@/lib/data/gl";

export function MonthlySpendChart({ data }: { data: MonthlyRanchCostPoint[] }) {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ranch spend, by month</CardTitle>
        <CardDescription>What you&apos;ve spent running the whole operation, month by month — every lot combined.</CardDescription>
      </CardHeader>
      <div className="h-72 px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month_end" tickFormatter={formatDate} tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => formatMoney(v)} width={80} tick={{ fontSize: 11 }} />
            <Tooltip labelFormatter={(label) => formatDate(String(label))} formatter={(value) => formatMoney(Number(value))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="direct" name="Direct" stackId="cost" fill={CATEGORICAL.olive} radius={[0, 0, 0, 0]} />
            <Bar dataKey="indirect" name="Indirect" stackId="cost" fill={CATEGORICAL.rust} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

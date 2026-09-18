"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CATEGORICAL } from "@/lib/theme/colors";
import { formatMoney } from "@/lib/format";

interface Row {
  report_line: string;
  total: number;
}

export function CostBreakdownChart({ data }: { data: Row[] }) {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Direct cost breakdown (life-to-date)</CardTitle>
        <CardDescription>Every Direct GL line for this lot — the source rows behind Operating $ and All-In $.</CardDescription>
      </CardHeader>
      <div className="h-72 px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => formatMoney(v)} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="report_line" width={150} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(value: number) => [formatMoney(value), "Amount"]} />
            <Bar dataKey="total" radius={[0, 4, 4, 0]} fill={CATEGORICAL.steelBlue} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

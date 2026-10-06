"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CATEGORICAL } from "@/lib/theme/colors";
import { formatMoney, formatDate } from "@/lib/format";

interface Row {
  week_end: string;
  direct: number;
  indirect: number;
}

export function WeeklyCostChart({ data }: { data: Row[] }) {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Weekly cost, last 13 weeks</CardTitle>
        <CardDescription>Direct and overhead spend on this lot, week by week.</CardDescription>
      </CardHeader>
      <div className="h-64 px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="week_end" tickFormatter={formatDate} tick={{ fontSize: 10 }} />
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

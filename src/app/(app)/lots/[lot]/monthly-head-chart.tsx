"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CATEGORICAL } from "@/lib/theme/colors";
import { formatNumber, formatDate } from "@/lib/format";
import type { MonthlyHeadPoint } from "@/lib/data/gl";

export function MonthlyHeadChart({ data }: { data: MonthlyHeadPoint[] }) {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Head on hand, by month</CardTitle>
        <CardDescription>How the count on this lot has moved since it started.</CardDescription>
      </CardHeader>
      <div className="h-64 px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="month_end" tickFormatter={formatDate} tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => formatNumber(v)} width={50} tick={{ fontSize: 11 }} />
            <Tooltip labelFormatter={(label) => formatDate(String(label))} formatter={(value) => [`${formatNumber(Number(value))} head`, "On hand"]} />
            <Area type="monotone" dataKey="head_end" stroke={CATEGORICAL.steelBlue} fill={CATEGORICAL.steelBlue} fillOpacity={0.15} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

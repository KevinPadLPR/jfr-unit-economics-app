"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CATEGORICAL } from "@/lib/theme/colors";

export function AdgComparisonChart({ targetAdg, actualAdg }: { targetAdg: number | null; actualAdg: number }) {
  if (targetAdg === null) return null;

  const data = [
    { name: "Target", value: targetAdg, fill: CATEGORICAL.steelBlue },
    { name: "Actual (used)", value: actualAdg, fill: CATEGORICAL.olive },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Target vs. actual daily gain</CardTitle>
        <CardDescription>
          How this lot&apos;s cattle are gaining weight against what was assumed going in — a snapshot, not a
          trend, since a lot only gets one realized ADG reading at a time.
        </CardDescription>
      </CardHeader>
      <div className="h-48 px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => `${v.toFixed(1)} lb/day`} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => [`${Number(value).toFixed(2)} lb/day`, ""]} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DIVERGING } from "@/lib/theme/colors";
import { formatMoney } from "@/lib/format";

interface Row {
  lot: string;
  unrealized: number;
  lightCalfCaveat: boolean;
}

export function UnrealizedByLotChart({ data }: { data: Row[] }) {
  if (data.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Unrealized position by open lot</CardTitle>
        <CardDescription>
          Marked value minus cost basis, at the latest feeder-cattle CME settle. Lots under 600 lb are marked
          against a contract sized for much heavier cattle — see the note below the chart.
        </CardDescription>
      </CardHeader>
      <div className="h-72 px-2 pb-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="lot" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={50} />
            <YAxis tickFormatter={(v) => formatMoney(v)} width={90} tick={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="var(--baseline, #c3c2b7)" />
            <Tooltip
              formatter={(value: number, _name, item) => [
                `${formatMoney(value)}${item.payload.lightCalfCaveat ? " (light-calf mark — see note)" : ""}`,
                "Unrealized",
              ]}
            />
            <Bar dataKey="unrealized" radius={[4, 4, 4, 4]}>
              {data.map((row) => (
                <Cell key={row.lot} fill={row.unrealized >= 0 ? DIVERGING.positive : DIVERGING.negative} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.some((r) => r.lightCalfCaveat) && (
        <p className="px-4 pb-4 text-xs text-muted-foreground">
          Lots marked with a lighter bar tooltip note are under 600 lb, marked against the CME feeder contract
          (sized for 700-800 lb cattle) — this can show large artificial unrealized losses. A real own-basis table
          for light calves doesn&apos;t exist yet.
        </p>
      )}
    </Card>
  );
}

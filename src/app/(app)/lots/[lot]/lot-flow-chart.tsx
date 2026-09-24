"use client";

import { Sankey, ResponsiveContainer, Tooltip, Rectangle } from "recharts";
import type { NodeProps, LinkProps } from "recharts/types/chart/Sankey";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CATEGORICAL, STATUS, DIVERGING } from "@/lib/theme/colors";
import { formatNumber } from "@/lib/format";
import type { LotFlow } from "@/lib/data/lot-flow";

const CATEGORY_COLOR: Record<string, string> = {
  Purchased: CATEGORICAL.olive,
  Born: CATEGORICAL.rust,
  "Transfer In": CATEGORICAL.plum,
  Sold: STATUS.good,
  Died: STATUS.critical,
  "Transfer Out": CATEGORICAL.steelBlue,
  "Still On Feed": DIVERGING.neutral,
};

function FlowNode({ x, y, width, height, payload }: NodeProps, lot: string) {
  const isLot = payload.name === lot;
  const color = isLot ? "#1A1E16" : (CATEGORY_COLOR[payload.name] ?? DIVERGING.neutral);
  const isSource = x < 40; // sources render at the left edge of the plot area

  return (
    <g>
      <Rectangle x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.9} />
      <text
        x={isLot ? x + width / 2 : isSource ? x - 8 : x + width + 8}
        y={y + height / 2}
        textAnchor={isLot ? "middle" : isSource ? "end" : "start"}
        dy={isLot ? -height / 2 - 6 : 4}
        fontSize={11}
        fill="var(--foreground)"
      >
        {payload.name}
      </text>
      <text
        x={isLot ? x + width / 2 : isSource ? x - 8 : x + width + 8}
        y={y + height / 2}
        textAnchor={isLot ? "middle" : isSource ? "end" : "start"}
        dy={isLot ? -height / 2 + 10 : 17}
        fontSize={10}
        fill="var(--muted-foreground)"
      >
        {formatNumber(payload.value)} hd
      </text>
    </g>
  );
}

function FlowLink({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload }: LinkProps) {
  const color = CATEGORY_COLOR[payload.source.name] ?? CATEGORY_COLOR[payload.target.name] ?? DIVERGING.neutral;
  return (
    <path
      d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      stroke={color}
      strokeOpacity={0.35}
      strokeWidth={linkWidth}
      fill="none"
    />
  );
}

export function LotFlowChart({ lot, flow }: { lot: string; flow: LotFlow }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cattle flow</CardTitle>
        <CardDescription>Where this lot&apos;s cattle came from and where they&apos;ve gone, life-to-date.</CardDescription>
      </CardHeader>
      <div className="h-80 px-4 pb-6">
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={flow}
            nodePadding={28}
            nodeWidth={12}
            margin={{ top: 10, right: 110, bottom: 10, left: 110 }}
            link={(props: LinkProps) => <FlowLink {...props} />}
            node={(props: NodeProps) => FlowNode(props, lot)}
          >
            <Tooltip formatter={(value) => [`${formatNumber(Number(value))} head`, ""]} />
          </Sankey>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

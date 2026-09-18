"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FilterSelect, ALL } from "@/components/filter-select";
import { formatMoney, formatPerLb, formatNumber } from "@/lib/format";
import type { ScorecardRow } from "@/lib/data/scorecard";

const CONFIDENCE_LABEL: Record<ScorecardRow["confidence"], string> = {
  H: "High",
  M: "Medium",
  L: "Low",
};

const CONFIDENCE_VARIANT: Record<ScorecardRow["confidence"], "good" | "warning" | "critical"> = {
  H: "good",
  M: "warning",
  L: "critical",
};

function uniqueOptions(rows: ScorecardRow[], key: keyof ScorecardRow) {
  const values = Array.from(new Set(rows.map((r) => r[key]).filter((v): v is string => !!v)));
  return values.sort().map((v) => ({ value: v, label: v }));
}

export function ScorecardTable({ rows }: { rows: ScorecardRow[] }) {
  const [status, setStatus] = useState(ALL);
  const [feedType, setFeedType] = useState(ALL);
  const [locationType, setLocationType] = useState(ALL);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (status === ALL || r.status === status) &&
          (feedType === ALL || r.feedType === feedType) &&
          (locationType === ALL || r.locationType === locationType)
      ),
    [rows, status, feedType, locationType]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <FilterSelect label="Status" value={status} options={uniqueOptions(rows, "status")} onChange={setStatus} className="w-40" />
        <FilterSelect label="Feed type" value={feedType} options={uniqueOptions(rows, "feedType")} onChange={setFeedType} className="w-40" />
        <FilterSelect label="Location type" value={locationType} options={uniqueOptions(rows, "locationType")} onChange={setLocationType} className="w-40" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lot</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Feed type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Head in</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Avg DOF</TableHead>
              <TableHead className="text-right">ADG used</TableHead>
              <TableHead className="text-right">$ / head in</TableHead>
              <TableHead className="text-right">COG all-in</TableHead>
              <TableHead>Confidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.lot}>
                <TableCell className="font-medium">
                  <Link href={`/lots/${encodeURIComponent(r.lot)}`} className="hover:underline">
                    {r.lot}
                  </Link>
                </TableCell>
                <TableCell>{r.status ?? "—"}</TableCell>
                <TableCell>{r.feedType ?? "—"}</TableCell>
                <TableCell>{r.locationType ?? "—"}</TableCell>
                <TableCell className="text-right">{formatNumber(r.headIn)}</TableCell>
                <TableCell className="text-right">{formatNumber(r.headOnHand)}</TableCell>
                <TableCell className="text-right">{formatNumber(r.avgDof)}</TableCell>
                <TableCell className="text-right">{r.adgUsed.toFixed(2)}</TableCell>
                <TableCell className="text-right">{formatMoney(r.costInDollarsPerHead)}</TableCell>
                <TableCell className="text-right">{formatPerLb(r.cogAllIn)}</TableCell>
                <TableCell>
                  <Badge variant={CONFIDENCE_VARIANT[r.confidence]}>{CONFIDENCE_LABEL[r.confidence]}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

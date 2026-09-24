"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FilterSelect, ALL } from "@/components/filter-select";
import { Input } from "@/components/ui/input";
import { formatNumber, formatDate } from "@/lib/format";
import type { GlLotSummaryRow } from "@/lib/data/cost-of-gain";

const STATUS_VARIANT: Record<string, "good" | "neutral" | "warning" | "critical"> = {
  Open: "good",
  Closed: "neutral",
};

function statusBadge(status: string | null) {
  if (!status) return <Badge variant="neutral">Unknown</Badge>;
  return <Badge variant={STATUS_VARIANT[status] ?? "neutral"}>{status}</Badge>;
}

function uniqueOptions(rows: GlLotSummaryRow[], key: "status" | "feed_type" | "location_type") {
  const values = Array.from(new Set(rows.map((r) => r[key]).filter((v): v is string => !!v)));
  return values.sort().map((v) => ({ value: v, label: v }));
}

export function LotScheduleTable({ rows }: { rows: GlLotSummaryRow[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ALL);
  const [feedType, setFeedType] = useState(ALL);
  const [locationType, setLocationType] = useState(ALL);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (status === ALL || r.status === status) &&
        (feedType === ALL || r.feed_type === feedType) &&
        (locationType === ALL || r.location_type === locationType) &&
        (!term || r.lot.toLowerCase().includes(term))
    );
  }, [rows, search, status, feedType, locationType]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Search
          <Input placeholder="Lot name..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />
        </label>
        <FilterSelect label="Status" value={status} options={uniqueOptions(rows, "status")} onChange={setStatus} className="w-40" />
        <FilterSelect label="Feed type" value={feedType} options={uniqueOptions(rows, "feed_type")} onChange={setFeedType} className="w-40" />
        <FilterSelect label="Location" value={locationType} options={uniqueOptions(rows, "location_type")} onChange={setLocationType} className="w-40" />
        <p className="ml-auto text-sm text-muted-foreground">
          {filtered.length} of {rows.length} lots
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lot</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Feed type</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Head on hand</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((l) => (
              <TableRow key={l.lot}>
                <TableCell className="font-medium">
                  <Link href={`/lots/${encodeURIComponent(l.lot)}`} className="hover:underline">
                    {l.lot}
                  </Link>
                </TableCell>
                <TableCell>{statusBadge(l.status)}</TableCell>
                <TableCell>{l.feed_type ?? "—"}</TableCell>
                <TableCell>{l.location_type ?? "—"}</TableCell>
                <TableCell className="text-right">{formatNumber(l.head_on_hand)}</TableCell>
                <TableCell>{formatDate(l.last_activity)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

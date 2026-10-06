"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { ResolvedEntry } from "./resolve";
import { approveEntries, rejectEntry } from "./actions";

const KIND_LABEL: Record<ResolvedEntry["kind"], string> = {
  doctoring: "Doctoring",
  dead: "Death",
  move: "Move",
  count: "Count",
  weight: "Weight",
};

// Phase 1 only posts these two kinds (see post.ts) -- count/weight entries still show in
// the queue (so the office can see everything waiting), just can't be approved from here yet.
const POSTABLE_KINDS = new Set<ResolvedEntry["kind"]>(["doctoring", "dead", "move"]);

function describe(r: ResolvedEntry): string {
  if (r.kind === "move") {
    const from = r.pasture?.name ?? "?";
    const to = r.toPasture?.name ?? "?";
    const who = r.split ? r.split.map((s) => `${s.lot.lot_number} (${s.head})`).join(", ") : r.lot?.lot_number ?? "?";
    return `${who}: ${from} → ${to}${r.head ? `, ${r.head} hd` : ""}`;
  }
  if (r.kind === "count") return `${r.pasture?.name ?? "?"}: counted ${r.head ?? "?"} vs ${r.bookHead ?? "?"} on the books`;
  if (r.kind === "weight") return `${r.lot?.lot_number ?? "?"} @ ${r.pasture?.name ?? "?"}: ${r.head ?? 0} hd, avg ${r.grossAvg?.toFixed(0) ?? "?"} lb gross`;
  // doctoring / dead
  const medTxt = r.meds.length ? ` — ${r.meds.map((m) => m.name).filter(Boolean).join(", ")}` : "";
  return `${r.lot?.lot_number ?? "?"} tag ${r.tag || "?"} @ ${r.pasture?.name ?? "?"}: ${r.action?.name ?? "?"}${medTxt}`;
}

export function ApprovalsTable({ rows, canWrite }: { rows: ResolvedEntry[]; canWrite: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectableIds = useMemo(() => new Set(rows.filter((r) => POSTABLE_KINDS.has(r.kind) && r.ready).map((r) => r.entry.id)), [rows]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleApprove() {
    const ids = [...selected];
    startTransition(async () => {
      const result = await approveEntries(ids, notes);
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) setSelected(new Set());
    });
  }

  function handleReject(id: string) {
    const reason = rejectReason;
    startTransition(async () => {
      const result = await rejectEntry(id, reason);
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        setRejecting(null);
        setRejectReason("");
      }
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing pending.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <p className={`rounded-md border px-3 py-2 text-sm ${message.tone === "success" ? "border-[color-mix(in_srgb,var(--status-good)_50%,var(--border))] text-foreground" : "border-[color-mix(in_srgb,var(--status-critical)_50%,var(--border))] text-foreground"}`}>
          {message.text}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {canWrite && <TableHead className="w-8" />}
              <TableHead>Kind</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead>Status</TableHead>
              {canWrite && <TableHead>Note</TableHead>}
              {canWrite && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const canSelectThis = canWrite && selectableIds.has(r.entry.id);
              return (
                <TableRow key={r.entry.id}>
                  {canWrite && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(r.entry.id)}
                        disabled={!canSelectThis}
                        onChange={() => toggle(r.entry.id)}
                        aria-label={`Select entry ${r.entry.id}`}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge variant={r.kind === "dead" ? "critical" : "neutral"}>{KIND_LABEL[r.kind]}</Badge>
                    {!POSTABLE_KINDS.has(r.kind) && (
                      <p className="mt-1 text-xs text-muted-foreground">not postable from this preview yet</p>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <p>{describe(r)}</p>
                    {r.edited && <Badge variant="outline" className="mt-1">office-edited</Badge>}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {r.issues.length > 0 && (
                      <ul className="list-disc pl-4 text-xs text-[#8a3115]">
                        {r.issues.map((issue, i) => (
                          <li key={i}>{issue}</li>
                        ))}
                      </ul>
                    )}
                    {r.warnings.length > 0 && (
                      <ul className="list-disc pl-4 text-xs text-[#8a6d15]">
                        {r.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    )}
                    {r.issues.length === 0 && r.warnings.length === 0 && <span className="text-xs text-muted-foreground">ready</span>}
                  </TableCell>
                  {canWrite && (
                    <TableCell>
                      <input
                        type="text"
                        placeholder="optional note"
                        className="h-8 w-40 rounded-md border border-input bg-card px-2 text-xs"
                        value={notes[r.entry.id] ?? ""}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [r.entry.id]: e.target.value }))}
                      />
                    </TableCell>
                  )}
                  {canWrite && (
                    <TableCell>
                      {rejecting === r.entry.id ? (
                        <div className="flex flex-col gap-1">
                          <input
                            type="text"
                            placeholder="reason (required)"
                            className="h-8 w-40 rounded-md border border-input bg-card px-2 text-xs"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                          />
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-[#a12525] text-[#a12525] hover:bg-[#a12525]/10"
                              disabled={isPending}
                              onClick={() => handleReject(r.entry.id)}
                            >
                              Confirm
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(r.entry.id)}>
                          Reject
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {canWrite && (
        <div>
          <Button type="button" disabled={selected.size === 0 || isPending} onClick={handleApprove}>
            {isPending ? "Posting…" : `Approve selected (${selected.size})`}
          </Button>
        </div>
      )}
    </div>
  );
}

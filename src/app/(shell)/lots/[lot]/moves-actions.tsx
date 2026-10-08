"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { pairMoves, type MoveSource, type MoveDestination } from "./moves-pairing";
import { recordMove } from "./actions/moves";
import type { CurrentLocation } from "./data/lot";
import type { ActivePasture } from "./data/reference";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MoveActionButton({
  lotNumber,
  lotId,
  canWrite,
  headCurrent,
  locations,
  activePastures,
}: {
  lotNumber: string;
  lotId: string;
  canWrite: boolean;
  headCurrent: number | null;
  locations: CurrentLocation[];
  activePastures: ActivePasture[];
}) {
  const [open, setOpen] = useState(false);
  if (!canWrite) return null;

  const assigned = locations.reduce((sum, l) => sum + (l.head_count ?? 0), 0);
  const unassigned = Math.max(0, (headCurrent ?? 0) - assigned);

  const sources: MoveSource[] = [
    ...locations.map((l) => ({
      pastureId: l.pasture_id,
      label: `${l.ranch_name ?? "?"} / ${l.pasture_name ?? "?"}`,
      available: l.head_count ?? 0,
    })),
    ...(unassigned > 0 ? [{ pastureId: null, label: "Unassigned (initial placement)", available: unassigned }] : []),
  ];

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        ↔ + Move
      </Button>
      {open && (
        <MoveDialog lotNumber={lotNumber} lotId={lotId} sources={sources} activePastures={activePastures} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function MoveDialog({
  lotNumber,
  lotId,
  sources,
  activePastures,
  onClose,
}: {
  lotNumber: string;
  lotId: string;
  sources: MoveSource[];
  activePastures: ActivePasture[];
  onClose: () => void;
}) {
  const [requested, setRequested] = useState<Record<string, number>>({});
  const [destRows, setDestRows] = useState<{ pastureId: string; headCount: number }[]>([{ pastureId: activePastures[0]?.id ?? "", headCount: 0 }]);
  const [moveDate, setMoveDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const sourceKey = (pastureId: string | null) => pastureId ?? "__unassigned__";

  const totalRequested = sources.reduce((sum, s) => sum + (requested[sourceKey(s.pastureId)] ?? 0), 0);
  const totalDestination = destRows.reduce((sum, d) => sum + (d.headCount || 0), 0);

  const pairs = useMemo(() => {
    const srcInput = sources
      .map((s) => ({ ...s, requested: requested[sourceKey(s.pastureId)] ?? 0 }))
      .filter((s) => s.requested > 0);
    const dests: MoveDestination[] = destRows.filter((d) => d.pastureId && d.headCount > 0);
    return pairMoves(srcInput, dests);
  }, [sources, requested, destRows]);

  function addDestRow() {
    setDestRows((prev) => [...prev, { pastureId: activePastures[0]?.id ?? "", headCount: 0 }]);
  }
  function removeDestRow(i: number) {
    setDestRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateDestRow(i: number, patch: Partial<{ pastureId: string; headCount: number }>) {
    setDestRows((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function handleSave() {
    if (totalRequested === 0) {
      setMessage({ tone: "error", text: "Enter how many head to move from at least one pasture." });
      return;
    }
    if (totalRequested !== totalDestination) {
      setMessage({ tone: "error", text: `Sources total ${totalRequested} but destinations total ${totalDestination} -- they must match.` });
      return;
    }
    startTransition(async () => {
      const result = await recordMove(lotNumber, lotId, moveDate, pairs, notes.trim() || null);
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) onClose();
    });
  }

  return (
    <Dialog open onClose={onClose} title="Move cattle" className="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">From</p>
          <div className="flex flex-col gap-2">
            {sources.map((s) => (
              <div key={sourceKey(s.pastureId)} className="flex items-center gap-2 text-sm">
                <span className="flex-1">
                  {s.label} <span className="text-muted-foreground">({s.available} available)</span>
                </span>
                <Input
                  type="number"
                  min={0}
                  max={s.available}
                  className="w-24"
                  value={requested[sourceKey(s.pastureId)] ?? 0}
                  onChange={(e) =>
                    setRequested((prev) => ({ ...prev, [sourceKey(s.pastureId)]: Math.min(s.available, parseInt(e.target.value, 10) || 0) }))
                  }
                />
              </div>
            ))}
            {sources.length === 0 && <p className="text-sm text-muted-foreground">No head on hand to move.</p>}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">To</p>
          <div className="flex flex-col gap-2">
            {destRows.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <select
                  className="h-9 flex-1 rounded-md border border-input bg-card px-2"
                  value={d.pastureId}
                  onChange={(e) => updateDestRow(i, { pastureId: e.target.value })}
                >
                  {activePastures.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.ranch_name ?? "?"} / {p.name}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={0}
                  className="w-24"
                  value={d.headCount}
                  onChange={(e) => updateDestRow(i, { headCount: parseInt(e.target.value, 10) || 0 })}
                />
                {destRows.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeDestRow(i)}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={addDestRow}>
              + Add destination
            </Button>
          </div>
        </div>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Date
          <Input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Notes (optional)
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {message && <p className={`text-sm ${message.tone === "error" ? "text-[#a12525]" : "text-muted-foreground"}`}>{message.text}</p>}
        <div className="flex gap-2">
          <Button type="button" disabled={isPending || sources.length === 0} onClick={handleSave}>
            {isPending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

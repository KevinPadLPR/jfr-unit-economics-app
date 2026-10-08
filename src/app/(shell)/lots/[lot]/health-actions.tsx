"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { isValidTagNumber } from "./actions/health-validation";
import { recordDeaths, recordMissingHead, recordStrayReturn, type DeathRow } from "./actions/health";
import type { CurrentLocation } from "./data/lot";
import type { ActivePasture } from "./data/reference";

function Message({ text, tone }: { text: string; tone: "success" | "error" }) {
  return <p className={`text-sm ${tone === "error" ? "text-[#a12525]" : "text-muted-foreground"}`}>{text}</p>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function HealthActionButtons({
  lotNumber,
  lotId,
  canWrite,
  lotClosed,
  lotIsFeedPen,
  locations,
  activePastures,
}: {
  lotNumber: string;
  lotId: string;
  canWrite: boolean;
  lotClosed: boolean;
  lotIsFeedPen: boolean;
  locations: CurrentLocation[];
  activePastures: ActivePasture[];
}) {
  const [openModal, setOpenModal] = useState<"deaths" | "missing" | "stray" | null>(null);
  if (!canWrite) return null;

  const adjustmentsDisabledReason = lotClosed
    ? "This lot is closed -- re-open it first."
    : lotIsFeedPen
      ? "Feed pens use their own entries (Head found / Record removal), not this."
      : null;

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => setOpenModal("deaths")}>
        ⚠ + Record deaths
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={!!adjustmentsDisabledReason}
        title={adjustmentsDisabledReason ?? undefined}
        onClick={() => setOpenModal("missing")}
      >
        − Write off missing
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={!!adjustmentsDisabledReason}
        title={adjustmentsDisabledReason ?? undefined}
        onClick={() => setOpenModal("stray")}
      >
        + Stray returned
      </Button>

      {openModal === "deaths" && (
        <RecordDeathsDialog lotNumber={lotNumber} lotId={lotId} locations={locations} onClose={() => setOpenModal(null)} />
      )}
      {openModal === "missing" && (
        <HeadAdjustmentDialog
          mode="missing"
          lotNumber={lotNumber}
          lotId={lotId}
          pastureOptions={locations.map((l) => ({ id: l.pasture_id, label: `${l.ranch_name ?? "?"} / ${l.pasture_name ?? "?"} (${l.head_count ?? 0} hd)` }))}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === "stray" && (
        <HeadAdjustmentDialog
          mode="stray"
          lotNumber={lotNumber}
          lotId={lotId}
          pastureOptions={activePastures.map((p) => ({ id: p.id, label: `${p.ranch_name ?? "?"} / ${p.name}` }))}
          onClose={() => setOpenModal(null)}
        />
      )}
    </div>
  );
}

function RecordDeathsDialog({
  lotNumber,
  lotId,
  locations,
  onClose,
}: {
  lotNumber: string;
  lotId: string;
  locations: CurrentLocation[];
  onClose: () => void;
}) {
  const [rows, setRows] = useState<DeathRow[]>([{ pastureId: locations[0]?.pasture_id ?? "", tagNumber: "", headCount: 1 }]);
  const [eventDate, setEventDate] = useState(todayIso());
  const [cause, setCause] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateRow(i: number, patch: Partial<DeathRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { pastureId: locations[0]?.pasture_id ?? "", tagNumber: "", headCount: 1 }]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleSave() {
    for (const r of rows) {
      if (r.tagNumber && !isValidTagNumber(r.tagNumber)) {
        setMessage({ tone: "error", text: `Tag "${r.tagNumber}" isn't a valid tag number.` });
        return;
      }
    }
    startTransition(async () => {
      const result = await recordDeaths(
        lotNumber,
        lotId,
        rows.map((r) => ({ ...r, tagNumber: r.tagNumber || null })),
        eventDate,
        cause.trim() || null,
        notes.trim() || null
      );
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) onClose();
    });
  }

  return (
    <Dialog open onClose={onClose} title="Record deaths">
      <div className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 border-b border-border pb-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Pasture
              <select
                className="h-9 rounded-md border border-input bg-card px-2 text-sm"
                value={r.pastureId}
                onChange={(e) => updateRow(i, { pastureId: e.target.value })}
              >
                {locations.map((l) => (
                  <option key={l.pasture_id} value={l.pasture_id}>
                    {l.ranch_name ?? "?"} / {l.pasture_name ?? "?"}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Tag (optional)
              <Input className="w-24" value={r.tagNumber ?? ""} onChange={(e) => updateRow(i, { tagNumber: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Head
              <Input
                type="number"
                min={1}
                className="w-20"
                value={r.headCount}
                onChange={(e) => updateRow(i, { headCount: parseInt(e.target.value, 10) || 0 })}
              />
            </label>
            {rows.length > 1 && (
              <Button type="button" size="sm" variant="ghost" onClick={() => removeRow(i)}>
                Remove
              </Button>
            )}
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={addRow}>
          + Add row
        </Button>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Date
          <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Cause (optional)
          <Input value={cause} onChange={(e) => setCause(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Notes (optional)
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {message && <Message tone={message.tone} text={message.text} />}
        <div className="flex gap-2">
          <Button type="button" disabled={isPending || !locations.length} onClick={handleSave}>
            {isPending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
        {!locations.length && <p className="text-xs text-muted-foreground">No open pasture assignment on this lot -- nothing to record against.</p>}
      </div>
    </Dialog>
  );
}

function HeadAdjustmentDialog({
  mode,
  lotNumber,
  lotId,
  pastureOptions,
  onClose,
}: {
  mode: "missing" | "stray";
  lotNumber: string;
  lotId: string;
  pastureOptions: { id: string; label: string }[];
  onClose: () => void;
}) {
  const [pastureId, setPastureId] = useState(pastureOptions[0]?.id ?? "");
  const [headCount, setHeadCount] = useState(1);
  const [eventDate, setEventDate] = useState(todayIso());
  const [tagNumber, setTagNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (tagNumber && !isValidTagNumber(tagNumber)) {
      setMessage({ tone: "error", text: `Tag "${tagNumber}" isn't a valid tag number.` });
      return;
    }
    startTransition(async () => {
      const action = mode === "missing" ? recordMissingHead : recordStrayReturn;
      const result = await action(lotNumber, lotId, pastureId, headCount, eventDate, tagNumber || null, notes.trim() || null);
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) onClose();
    });
  }

  return (
    <Dialog open onClose={onClose} title={mode === "missing" ? "Write off missing head" : "Stray returned"}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Pasture
          <select className="h-9 rounded-md border border-input bg-card px-2 text-sm" value={pastureId} onChange={(e) => setPastureId(e.target.value)}>
            {pastureOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Head
          <Input type="number" min={1} value={headCount} onChange={(e) => setHeadCount(parseInt(e.target.value, 10) || 0)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Date
          <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Tag (optional)
          <Input value={tagNumber} onChange={(e) => setTagNumber(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Notes (optional)
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {message && <Message tone={message.tone} text={message.text} />}
        <div className="flex gap-2">
          <Button type="button" disabled={isPending || !pastureId} onClick={handleSave}>
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

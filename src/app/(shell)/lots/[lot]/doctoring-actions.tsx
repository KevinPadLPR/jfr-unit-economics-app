"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { recordDoctoring, type DoctoringInput } from "./actions/doctoring";
import type { MedRowInput } from "./actions/doctoring-validation";
import type { CurrentLocation } from "./data/lot";
import type { ActivePasture, FieldAction, MedicationCatalogEntry } from "./data/reference";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyMedRows(): MedRowInput[] {
  return [1, 2, 3].map((position) => ({ position, medicationId: null, medicationNameFreetext: null, doseCc: null }));
}

export function DoctoringActionButton({
  lotNumber,
  lotId,
  canWrite,
  locations,
  activePastures,
  fieldActions,
  medicationCatalog,
}: {
  lotNumber: string;
  lotId: string;
  canWrite: boolean;
  locations: CurrentLocation[];
  activePastures: ActivePasture[];
  fieldActions: FieldAction[];
  medicationCatalog: MedicationCatalogEntry[];
}) {
  const [open, setOpen] = useState(false);
  if (!canWrite) return null;

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        💊 + New
      </Button>
      {open && (
        <DoctoringDialog
          lotNumber={lotNumber}
          lotId={lotId}
          locations={locations}
          activePastures={activePastures}
          fieldActions={fieldActions}
          medicationCatalog={medicationCatalog}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function DoctoringDialog({
  lotNumber,
  lotId,
  locations,
  activePastures,
  fieldActions,
  medicationCatalog,
  onClose,
}: {
  lotNumber: string;
  lotId: string;
  locations: CurrentLocation[];
  activePastures: ActivePasture[];
  fieldActions: FieldAction[];
  medicationCatalog: MedicationCatalogEntry[];
  onClose: () => void;
}) {
  const [tagNumber, setTagNumber] = useState("");
  const [noTag, setNoTag] = useState(false);
  const [actionId, setActionId] = useState(fieldActions[0]?.id ?? "");
  const [pastureId, setPastureId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [medRows, setMedRows] = useState<MedRowInput[]>(emptyMedRows());
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [tagOverride, setTagOverride] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const action = fieldActions.find((a) => a.id === actionId) ?? null;

  function updateMedRow(i: number, patch: Partial<MedRowInput>) {
    setMedRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function submit(overrideTagReason?: string) {
    const input: DoctoringInput = {
      tagNumber,
      noTag,
      actionId,
      actionRequiresNote: !!action?.requires_note,
      actionRequiresMeds: !!action?.requires_meds,
      date,
      pastureId: pastureId || null,
      notes: notes.trim() || null,
      medRows,
    };
    startTransition(async () => {
      const result = await recordDoctoring(lotNumber, lotId, input, overrideTagReason);
      if (result.needsTagOverride) {
        setTagOverride(result.message);
        return;
      }
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) onClose();
    });
  }

  return (
    <Dialog open onClose={onClose} title="New doctoring event" className="max-w-xl">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Tag
            <Input className="w-28" value={tagNumber} disabled={noTag} onChange={(e) => setTagNumber(e.target.value)} />
          </label>
          <label className="flex items-center gap-1 pb-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={noTag} onChange={(e) => setNoTag(e.target.checked)} />
            No tag
          </label>
        </div>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Action
          <select className="h-9 rounded-md border border-input bg-card px-2 text-sm" value={actionId} onChange={(e) => setActionId(e.target.value)}>
            <option value="">— Pick action —</option>
            {fieldActions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Pasture (optional)
          <select className="h-9 rounded-md border border-input bg-card px-2 text-sm" value={pastureId} onChange={(e) => setPastureId(e.target.value)}>
            <option value="">— Not recorded —</option>
            <optgroup label="This lot">
              {locations.map((l) => (
                <option key={l.pasture_id} value={l.pasture_id}>
                  {l.ranch_name ?? "?"} / {l.pasture_name ?? "?"}
                </option>
              ))}
            </optgroup>
            <optgroup label="Everywhere else">
              {activePastures
                .filter((p) => !locations.some((l) => l.pasture_id === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.ranch_name ?? "?"} / {p.name}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Date
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Medications (optional, up to 3)</p>
          {medRows.map((row, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <select
                className="h-9 flex-1 rounded-md border border-input bg-card px-2 text-sm"
                value={row.medicationId ?? (row.medicationNameFreetext ? "__freetext__" : "")}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__freetext__") updateMedRow(i, { medicationId: null, medicationNameFreetext: "" });
                  else if (v === "") updateMedRow(i, { medicationId: null, medicationNameFreetext: null });
                  else updateMedRow(i, { medicationId: v, medicationNameFreetext: null });
                }}
              >
                <option value="">— None —</option>
                {medicationCatalog.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
                <option value="__freetext__">(Other — type below)</option>
              </select>
              {row.medicationId === null && row.medicationNameFreetext !== null && (
                <Input
                  className="w-40"
                  placeholder="Free-text med name"
                  value={row.medicationNameFreetext ?? ""}
                  onChange={(e) => updateMedRow(i, { medicationNameFreetext: e.target.value })}
                />
              )}
              <Input
                type="number"
                step="0.1"
                min={0}
                placeholder="Dose (cc)"
                className="w-24"
                value={row.doseCc ?? ""}
                onChange={(e) => updateMedRow(i, { doseCc: e.target.value ? parseFloat(e.target.value) : null })}
              />
            </div>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Notes {action?.requires_note ? "(required for this action)" : "(optional)"}
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {tagOverride && (
          <div className="flex flex-col gap-2 rounded-md border border-[#b58900] bg-[#b58900]/10 p-2">
            <p className="text-sm text-foreground">{tagOverride}</p>
            <Input placeholder="Reason to proceed anyway" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={isPending || !overrideReason.trim()}
                onClick={() => {
                  setTagOverride(null);
                  submit(overrideReason);
                }}
              >
                Save anyway
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setTagOverride(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {message && <p className={`text-sm ${message.tone === "error" ? "text-[#a12525]" : "text-muted-foreground"}`}>{message.text}</p>}

        {!tagOverride && (
          <div className="flex gap-2">
            <Button type="button" disabled={isPending} onClick={() => submit()}>
              {isPending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

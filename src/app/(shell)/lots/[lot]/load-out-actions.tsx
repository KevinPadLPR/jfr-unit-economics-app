"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { DeleteEventButton } from "./delete-event-button";
import { computeTagSummary } from "./actions/load-out-validation";
import { saveLoadOut, deleteLoadOut, type LoadOutInput, type TagConflict, type TagConflictChoice } from "./actions/load-out";
import type { ActivePasture, ReceivingProtocol } from "./data/reference";
import type { Invoice, UnlinkedReceipt } from "./data/purchases";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface DestRow {
  pastureId: string;
  headCount: number | null;
}

function emptyInput(defaultProtocolId: string): LoadOutInput {
  return {
    receiptDate: todayIso(),
    headCount: 0,
    tagStart: null,
    tagEnd: null,
    missingTagsRaw: "",
    receivingProtocolId: defaultProtocolId || null,
    invoiceId: null,
    notes: null,
    destinationRows: [],
  };
}

function receiptToInput(receipt: UnlinkedReceipt): LoadOutInput {
  return {
    receiptDate: receipt.receipt_date ?? "",
    headCount: receipt.head_count ?? 0,
    tagStart: receipt.tag_start,
    tagEnd: receipt.tag_end,
    missingTagsRaw: (receipt.missing_tags ?? []).join(", "),
    receivingProtocolId: receipt.receiving_protocol_id,
    invoiceId: receipt.invoice_id,
    notes: receipt.notes,
    destinationRows: [],
  };
}

function invoiceLabel(inv: Invoice): string {
  return `${inv.invoice_date ?? "?"} · ${inv.invoice_number ?? "(no #)"} · ${inv.head_count ?? 0} hd`;
}

export function NewLoadOutButton({
  lotId,
  lotNumber,
  fiscalYear,
  activePastures,
  protocols,
  defaultProtocolId,
  invoices,
}: {
  lotId: string;
  lotNumber: string;
  fiscalYear: string | null;
  activePastures: ActivePasture[];
  protocols: ReceivingProtocol[];
  defaultProtocolId: string;
  invoices: Invoice[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Load Out
      </Button>
      {open && (
        <LoadOutFormDialog
          mode="new"
          receiptId={null}
          lotId={lotId}
          lotNumber={lotNumber}
          fiscalYear={fiscalYear}
          activePastures={activePastures}
          protocols={protocols}
          invoices={invoices}
          initial={emptyInput(defaultProtocolId)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function ReceiptCardActions({
  receipt,
  lotId,
  lotNumber,
  fiscalYear,
  activePastures,
  protocols,
  invoices,
  canWrite,
}: {
  receipt: UnlinkedReceipt;
  lotId: string;
  lotNumber: string;
  fiscalYear: string | null;
  activePastures: ActivePasture[];
  protocols: ReceivingProtocol[];
  invoices: Invoice[];
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (!canWrite) return null;

  return (
    <div className="flex gap-1">
      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <DeleteEventButton eventId={receipt.id} canDelete={canWrite} action={(id) => deleteLoadOut(lotNumber, id)} />
      {editing && (
        <LoadOutFormDialog
          mode="edit"
          receiptId={receipt.id}
          lotId={lotId}
          lotNumber={lotNumber}
          fiscalYear={fiscalYear}
          activePastures={activePastures}
          protocols={protocols}
          invoices={invoices}
          initial={receiptToInput(receipt)}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function LoadOutFormDialog({
  mode,
  receiptId,
  lotId,
  lotNumber,
  fiscalYear,
  activePastures,
  protocols,
  invoices,
  initial,
  onClose,
}: {
  mode: "new" | "edit";
  receiptId: string | null;
  lotId: string;
  lotNumber: string;
  fiscalYear: string | null;
  activePastures: ActivePasture[];
  protocols: ReceivingProtocol[];
  invoices: Invoice[];
  initial: LoadOutInput;
  onClose: () => void;
}) {
  const [form, setForm] = useState<LoadOutInput>(initial);
  const [destRows, setDestRows] = useState<DestRow[]>([{ pastureId: "", headCount: null }]);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [conflicts, setConflicts] = useState<TagConflict[] | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const locked = mode === "edit";
  const tagSummary = computeTagSummary(form.tagStart, form.tagEnd, form.missingTagsRaw ? form.missingTagsRaw.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n)) : []);

  function addDestRow() {
    setDestRows((prev) => [...prev, { pastureId: "", headCount: null }]);
  }
  function removeDestRow(i: number) {
    setDestRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateDestRow(i: number, patch: Partial<DestRow>) {
    setDestRows((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function submit(tagConflictChoice?: TagConflictChoice) {
    startTransition(async () => {
      const result = await saveLoadOut(mode, receiptId, lotId, lotNumber, fiscalYear, { ...form, destinationRows: destRows }, tagConflictChoice);
      if (result.needsTagConflict) {
        setConflicts(result.conflicts ?? []);
        setMessage({ tone: "error", text: result.message });
        return;
      }
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) onClose();
    });
  }

  if (conflicts) {
    const byLot = new Map<string, number[]>();
    conflicts.forEach((c) => byLot.set(c.lotNumber, [...(byLot.get(c.lotNumber) ?? []), c.tagNumber]));
    return (
      <Dialog open onClose={onClose} title="Tag conflict">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">{message?.text}</p>
          {[...byLot.entries()].map(([lotNum, tags]) => (
            <p key={lotNum} className="text-xs text-foreground">
              <strong>{lotNum}:</strong> {tags.sort((a, b) => a - b).join(", ")}
            </p>
          ))}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Reason to override (optional -- leave blank to skip the conflicting tags instead)
            <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button type="button" disabled={isPending} onClick={() => submit({ skip: true })}>
              Skip conflicting tags
            </Button>
            <Button type="button" variant="outline" disabled={isPending || !overrideReason.trim()} onClick={() => submit({ overrideReason })}>
              Override with reason
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title={mode === "edit" ? "Edit load out" : "New load out"} className="max-w-xl">
      <div className="flex flex-col gap-3">
        {locked && (
          <p className="text-xs text-muted-foreground">
            Date, head, tags and destination pastures are locked on a saved load out (changing them here never moved cattle). To change them, delete
            this load out, which puts everything back, and enter it again.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Date
            <Input type="date" disabled={locked} value={form.receiptDate} onChange={(e) => setForm((f) => ({ ...f, receiptDate: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Head count
            <Input
              type="number"
              min={1}
              disabled={locked}
              className="w-24"
              value={form.headCount}
              onChange={(e) => setForm((f) => ({ ...f, headCount: parseInt(e.target.value, 10) || 0 }))}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Tag start
            <Input
              type="number"
              disabled={locked}
              className="w-24"
              value={form.tagStart ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, tagStart: e.target.value ? parseInt(e.target.value, 10) : null }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Tag end
            <Input
              type="number"
              disabled={locked}
              className="w-24"
              value={form.tagEnd ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, tagEnd: e.target.value ? parseInt(e.target.value, 10) : null }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Missing tags
            <Input
              disabled={locked}
              className="w-40"
              placeholder="comma separated"
              value={form.missingTagsRaw}
              onChange={(e) => setForm((f) => ({ ...f, missingTagsRaw: e.target.value }))}
            />
          </label>
        </div>
        {!tagSummary.error && tagSummary.count != null && (
          <p className="text-xs text-muted-foreground">
            {tagSummary.count} tags · {tagSummary.ranges}
            {form.headCount !== tagSummary.count ? ` ⚠ doesn't match head count (${form.headCount})` : ""}
          </p>
        )}
        {tagSummary.error && <p className="text-xs text-[#a12525]">{tagSummary.error}</p>}

        {!locked && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Destination pasture(s)</p>
            {destRows.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <select
                  className="h-9 flex-1 rounded-md border border-input bg-card px-2"
                  value={d.pastureId}
                  onChange={(e) => updateDestRow(i, { pastureId: e.target.value })}
                >
                  <option value="">— Pick pasture —</option>
                  {activePastures.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.ranch_name ?? "?"} / {p.name}
                    </option>
                  ))}
                </select>
                {destRows.length > 1 && (
                  <Input
                    type="number"
                    min={1}
                    className="w-24"
                    placeholder="head"
                    value={d.headCount ?? ""}
                    onChange={(e) => updateDestRow(i, { headCount: e.target.value ? parseInt(e.target.value, 10) : null })}
                  />
                )}
                {destRows.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeDestRow(i)}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
            {destRows.length === 1 && (
              <p className="text-xs text-muted-foreground">All {form.headCount || 0} head go here. Click &quot;+ Add pasture&quot; to split.</p>
            )}
            <Button type="button" size="sm" variant="outline" onClick={addDestRow}>
              + Add pasture
            </Button>
          </div>
        )}

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Receiving protocol
          <select
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            value={form.receivingProtocolId ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, receivingProtocolId: e.target.value || null }))}
          >
            <option value="">— None (no processing cost) —</option>
            {protocols.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.version_label ? ` ${p.version_label}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Invoice
          <select
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            value={form.invoiceId ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, invoiceId: e.target.value || null }))}
          >
            <option value="">— Not linked —</option>
            {invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {invoiceLabel(inv)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Notes
          <Input value={form.notes ?? ""} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </label>

        {message && <p className={`text-sm ${message.tone === "error" ? "text-[#a12525]" : "text-muted-foreground"}`}>{message.text}</p>}
        <div className="flex gap-2">
          <Button type="button" disabled={isPending} onClick={() => submit()}>
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

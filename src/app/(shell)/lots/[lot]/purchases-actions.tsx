"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { DeleteEventButton } from "./delete-event-button";
import { saveInvoice, deleteInvoice, type InvoiceInput } from "./actions/purchases";
import type { Invoice } from "./data/purchases";
import type { ReceivingProtocol } from "./data/reference";

const PROTOCOL_TYPES: Record<string, string> = {
  receiving: "Receiving",
  first_pull: "First Pull",
  second_pull: "Second Pull",
  revaccination: "Revaccination",
  implant: "Implant",
  other: "Other",
};

function protocolLabel(p: ReceivingProtocol): string {
  return `${p.name}${p.version_label ? " " + p.version_label : ""} (${PROTOCOL_TYPES[p.protocol_type] ?? p.protocol_type})`;
}

function emptyInput(defaultProtocolId: string): InvoiceInput {
  return {
    invoiceDate: new Date().toISOString().slice(0, 10),
    invoiceNumber: null,
    headCount: 0,
    totalWeightLb: null,
    totalCost: null,
    receivingProtocolId: defaultProtocolId || null,
    notes: null,
  };
}

function invoiceToInput(invoice: Invoice): InvoiceInput {
  return {
    invoiceDate: invoice.invoice_date ?? "",
    invoiceNumber: invoice.invoice_number,
    headCount: invoice.head_count ?? 0,
    totalWeightLb: invoice.total_weight_lb,
    totalCost: invoice.total_cost,
    receivingProtocolId: invoice.receiving_protocol_id,
    notes: invoice.notes,
  };
}

export function NewInvoiceButton({
  lotId,
  lotNumber,
  protocols,
  defaultProtocolId,
}: {
  lotId: string;
  lotNumber: string;
  protocols: ReceivingProtocol[];
  defaultProtocolId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        + New
      </Button>
      {open && (
        <InvoiceFormDialog
          mode="new"
          invoiceId={null}
          lotId={lotId}
          lotNumber={lotNumber}
          protocols={protocols}
          initial={emptyInput(defaultProtocolId)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function InvoiceCardActions({
  invoice,
  lotId,
  lotNumber,
  protocols,
  canWrite,
}: {
  invoice: Invoice;
  lotId: string;
  lotNumber: string;
  protocols: ReceivingProtocol[];
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (!canWrite) return null;

  return (
    <div className="flex gap-1">
      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <DeleteEventButton eventId={invoice.id} canDelete={canWrite} action={(id) => deleteInvoice(lotNumber, id)} />
      {editing && (
        <InvoiceFormDialog
          mode="edit"
          invoiceId={invoice.id}
          lotId={lotId}
          lotNumber={lotNumber}
          protocols={protocols}
          initial={invoiceToInput(invoice)}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function InvoiceFormDialog({
  mode,
  invoiceId,
  lotId,
  lotNumber,
  protocols,
  initial,
  onClose,
}: {
  mode: "new" | "edit";
  invoiceId: string | null;
  lotId: string;
  lotNumber: string;
  protocols: ReceivingProtocol[];
  initial: InvoiceInput;
  onClose: () => void;
}) {
  const [form, setForm] = useState<InvoiceInput>(initial);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await saveInvoice(mode, invoiceId, lotId, lotNumber, form);
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) onClose();
    });
  }

  return (
    <Dialog open onClose={onClose} title={mode === "edit" ? "Edit invoice" : "Add invoice"}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Invoice date
            <Input type="date" value={form.invoiceDate} onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Invoice number
            <Input className="w-32" value={form.invoiceNumber ?? ""} onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))} />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Head count
            <Input
              type="number"
              min={1}
              className="w-24"
              value={form.headCount}
              onChange={(e) => setForm((f) => ({ ...f, headCount: parseInt(e.target.value, 10) || 0 }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Total weight (lb)
            <Input
              type="number"
              className="w-28"
              value={form.totalWeightLb ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, totalWeightLb: e.target.value ? parseFloat(e.target.value) : null }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Total cost ($)
            <Input
              type="number"
              step="0.01"
              className="w-28"
              value={form.totalCost ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, totalCost: e.target.value ? parseFloat(e.target.value) : null }))}
            />
          </label>
        </div>
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
                {protocolLabel(p)}
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
          <Button type="button" disabled={isPending} onClick={handleSave}>
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

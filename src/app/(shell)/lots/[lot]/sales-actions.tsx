"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { DeleteEventButton } from "./delete-event-button";
import { CloseLotDialog } from "./lot-actions";
import { saveSale, deleteSale, type SaleInput, type SaleConfirmations } from "./actions/sales";
import type { ActivePasture, WithdrawalHold } from "./data/reference";
import type { Sale } from "./data/sales";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface SourceRow {
  pastureId: string;
  headCount: number | null;
}

function emptyInput(): SaleInput {
  return {
    saleDate: todayIso(),
    headCount: 0,
    grossWeightLb: null,
    netWeightLb: null,
    pricePerCwt: null,
    pricePerHead: null,
    totalPrice: null,
    buyer: null,
    saleInvoiceNumber: null,
    tagStart: null,
    tagEnd: null,
    missingTagsRaw: "",
    notes: null,
    sourceRows: [],
  };
}

function saleToInput(sale: Sale): SaleInput {
  return {
    saleDate: sale.sale_date ?? "",
    headCount: sale.head_count ?? 0,
    grossWeightLb: sale.gross_weight_lb,
    netWeightLb: sale.net_weight_lb,
    pricePerCwt: sale.price_per_cwt,
    pricePerHead: sale.price_per_head,
    totalPrice: sale.total_price,
    buyer: sale.buyer,
    saleInvoiceNumber: sale.sale_invoice_number,
    tagStart: sale.tag_start,
    tagEnd: sale.tag_end,
    missingTagsRaw: (sale.missing_tags ?? []).join(", "),
    notes: sale.notes,
    sourceRows: [],
  };
}

export function NewSaleButton({
  lotId,
  lotNumber,
  activePastures,
  pastBuyers,
}: {
  lotId: string;
  lotNumber: string;
  activePastures: ActivePasture[];
  pastBuyers: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Sale
      </Button>
      {open && (
        <SaleFormDialog mode="new" saleId={null} lotId={lotId} lotNumber={lotNumber} activePastures={activePastures} pastBuyers={pastBuyers} initial={emptyInput()} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

export function SaleCardActions({
  sale,
  lotId,
  lotNumber,
  activePastures,
  pastBuyers,
  canWrite,
  isOwner,
}: {
  sale: Sale;
  lotId: string;
  lotNumber: string;
  activePastures: ActivePasture[];
  pastBuyers: string[];
  canWrite: boolean;
  isOwner: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (!canWrite) return null;

  return (
    <div className="flex gap-1">
      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <DeleteEventButton eventId={sale.id} canDelete={isOwner} action={(id) => deleteSale(lotNumber, id)} />
      {editing && (
        <SaleFormDialog
          mode="edit"
          saleId={sale.id}
          lotId={lotId}
          lotNumber={lotNumber}
          activePastures={activePastures}
          pastBuyers={pastBuyers}
          initial={saleToInput(sale)}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

type PendingDialog = "noPrice" | "priceOverride" | "payWeight" | "withdrawal" | null;

function SaleFormDialog({
  mode,
  saleId,
  lotId,
  lotNumber,
  activePastures,
  pastBuyers,
  initial,
  onClose,
}: {
  mode: "new" | "edit";
  saleId: string | null;
  lotId: string;
  lotNumber: string;
  activePastures: ActivePasture[];
  pastBuyers: string[];
  initial: SaleInput;
  onClose: () => void;
}) {
  const locked = mode === "edit";
  const [form, setForm] = useState<SaleInput>(initial);
  const [sourceRows, setSourceRows] = useState<SourceRow[]>([{ pastureId: "", headCount: null }]);
  const [confirmations, setConfirmations] = useState<SaleConfirmations>({});
  const [pending, setPending] = useState<PendingDialog>(null);
  const [payWeightTies, setPayWeightTies] = useState(false);
  const [withdrawalHolds, setWithdrawalHolds] = useState<WithdrawalHold[]>([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [closeOffer, setCloseOffer] = useState(false);
  const [isPending, startTransition] = useTransition();

  function addSourceRow() {
    setSourceRows((prev) => [...prev, { pastureId: "", headCount: null }]);
  }
  function removeSourceRow(i: number) {
    setSourceRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateSourceRow(i: number, patch: Partial<SourceRow>) {
    setSourceRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function submit(extra?: Partial<SaleConfirmations>) {
    const merged = { ...confirmations, ...extra };
    setConfirmations(merged);
    setPending(null);
    startTransition(async () => {
      const result = await saveSale(mode, saleId, lotId, lotNumber, { ...form, sourceRows }, merged);
      if (result.needsNoPriceConfirm) {
        setPending("noPrice");
        setMessage({ tone: "error", text: result.message });
        return;
      }
      if (result.needsPriceOverride) {
        setPending("priceOverride");
        setMessage({ tone: "error", text: result.message });
        return;
      }
      if (result.needsPayWeightChoice) {
        setPending("payWeight");
        setPayWeightTies(result.needsPayWeightChoice.ties);
        setMessage({ tone: "error", text: result.message });
        return;
      }
      if (result.needsWithdrawalConfirm) {
        setPending("withdrawal");
        setWithdrawalHolds(result.withdrawalHolds ?? []);
        setMessage({ tone: "error", text: result.message });
        return;
      }
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) {
        if (result.lotNowEmpty) setCloseOffer(true);
        else onClose();
      }
    });
  }

  if (closeOffer) {
    return <CloseLotDialog lotNumber={lotNumber} lotId={lotId} closing={true} onClose={onClose} />;
  }

  if (pending) {
    return (
      <Dialog open onClose={onClose} title="Before saving">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">{message?.text}</p>

          {pending === "withdrawal" && (
            <div className="flex flex-col gap-1">
              {withdrawalHolds.map((h, i) => (
                <p key={i} className="text-xs text-foreground">
                  <strong>{h.tag_number}</strong> · {h.drug} · treated {h.treat_date} · clears {h.clear_date}
                </p>
              ))}
            </div>
          )}

          {pending === "priceOverride" && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Reason for the override
              <Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
            </label>
          )}

          <div className="flex gap-2">
            {pending === "noPrice" && (
              <Button type="button" disabled={isPending} onClick={() => submit({ noPriceConfirmed: true })}>
                Save anyway
              </Button>
            )}
            {pending === "priceOverride" && (
              <Button type="button" disabled={isPending || !overrideReason.trim()} onClick={() => submit({ priceOverrideReason: overrideReason })}>
                Save with override
              </Button>
            )}
            {pending === "payWeight" && payWeightTies && (
              <Button type="button" disabled={isPending} onClick={() => submit({ payWeightChoice: "book_gross" })}>
                Book gross as pay weight too
              </Button>
            )}
            {pending === "payWeight" && !payWeightTies && (
              <Button type="button" disabled={isPending} onClick={() => submit({ payWeightChoice: "proceed_without_net" })}>
                Save without pay weight
              </Button>
            )}
            {pending === "withdrawal" && (
              <Button type="button" disabled={isPending} onClick={() => submit({ withdrawalConfirmed: true })}>
                Confirm
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => setPending(null)}>
              {pending === "payWeight" ? "Go back and type net" : "Cancel"}
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title={mode === "edit" ? "Edit sale" : "New sale"} className="max-w-xl">
      <div className="flex flex-col gap-3">
        {locked && (
          <p className="text-xs text-muted-foreground">
            Head and source pastures are locked on a saved sale. Only the owner can delete it, which puts the head back.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Sale date
            <Input type="date" value={form.saleDate} onChange={(e) => setForm((f) => ({ ...f, saleDate: e.target.value }))} />
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
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Buyer
            <Input list="buyer-list" value={form.buyer ?? ""} onChange={(e) => setForm((f) => ({ ...f, buyer: e.target.value }))} />
            <datalist id="buyer-list">
              {pastBuyers.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Invoice #
            <Input className="w-28" value={form.saleInvoiceNumber ?? ""} onChange={(e) => setForm((f) => ({ ...f, saleInvoiceNumber: e.target.value }))} />
          </label>
        </div>

        {!locked && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Source pasture(s)</p>
            {sourceRows.map((row, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <select
                  className="h-9 flex-1 rounded-md border border-input bg-card px-2"
                  value={row.pastureId}
                  onChange={(e) => updateSourceRow(i, { pastureId: e.target.value })}
                >
                  <option value="">— Pick pasture —</option>
                  {activePastures.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.ranch_name ?? "?"} / {p.name}
                    </option>
                  ))}
                </select>
                {sourceRows.length > 1 && (
                  <Input
                    type="number"
                    min={1}
                    className="w-24"
                    placeholder="head"
                    value={row.headCount ?? ""}
                    onChange={(e) => updateSourceRow(i, { headCount: e.target.value ? parseInt(e.target.value, 10) : null })}
                  />
                )}
                {sourceRows.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeSourceRow(i)}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
            {sourceRows.length === 1 && <p className="text-xs text-muted-foreground">All {form.headCount || 0} head come from here.</p>}
            <Button type="button" size="sm" variant="outline" onClick={addSourceRow}>
              + Add pasture
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Gross weight (lb)
            <Input
              type="number"
              className="w-28"
              value={form.grossWeightLb ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, grossWeightLb: e.target.value ? parseFloat(e.target.value) : null }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Net (pay) weight (lb)
            <Input
              type="number"
              className="w-28"
              value={form.netWeightLb ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, netWeightLb: e.target.value ? parseFloat(e.target.value) : null }))}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            $/cwt
            <Input
              type="number"
              step="0.01"
              className="w-24"
              value={form.pricePerCwt ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, pricePerCwt: e.target.value ? parseFloat(e.target.value) : null }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            $/head
            <Input
              type="number"
              step="0.01"
              className="w-24"
              value={form.pricePerHead ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, pricePerHead: e.target.value ? parseFloat(e.target.value) : null }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Total price ($)
            <Input
              type="number"
              step="0.01"
              className="w-28"
              value={form.totalPrice ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, totalPrice: e.target.value ? parseFloat(e.target.value) : null }))}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Tag start
            <Input
              type="number"
              className="w-24"
              value={form.tagStart ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, tagStart: e.target.value ? parseInt(e.target.value, 10) : null }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Tag end
            <Input
              type="number"
              className="w-24"
              value={form.tagEnd ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, tagEnd: e.target.value ? parseInt(e.target.value, 10) : null }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Missing tags
            <Input
              className="w-40"
              placeholder="comma separated"
              value={form.missingTagsRaw}
              onChange={(e) => setForm((f) => ({ ...f, missingTagsRaw: e.target.value }))}
            />
          </label>
        </div>

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

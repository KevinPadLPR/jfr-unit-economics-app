"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { saveLotInfo, closeOrReopenLot, type LotFormInput, type UnweighedSale } from "./actions/lot";
import type { LotEditDetail } from "./data/lot";
import { formatDate, formatNumber } from "@/lib/format";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LotActions({
  lotNumber,
  lotId,
  canWrite,
  lotClosed,
  editDetail,
}: {
  lotNumber: string;
  lotId: string;
  canWrite: boolean;
  lotClosed: boolean;
  editDetail: LotEditDetail | null;
}) {
  const [formMode, setFormMode] = useState<"edit" | "duplicate" | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  if (!canWrite) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setFormMode("edit")}>
        Edit lot info
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setFormMode("duplicate")}>
        Duplicate lot
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setCloseOpen(true)}>
        {lotClosed ? "Re-open lot" : "Close lot"}
      </Button>

      {formMode && (
        <LotFormDialog mode={formMode} lotNumber={lotNumber} lotId={lotId} editDetail={editDetail} onClose={() => setFormMode(null)} />
      )}
      {closeOpen && <CloseLotDialog lotNumber={lotNumber} lotId={lotId} closing={!lotClosed} onClose={() => setCloseOpen(false)} />}
    </div>
  );
}

function LotFormDialog({
  mode,
  lotNumber,
  lotId,
  editDetail,
  onClose,
}: {
  mode: "edit" | "duplicate";
  lotNumber: string;
  lotId: string;
  editDetail: LotEditDetail | null;
  onClose: () => void;
}) {
  const router = useRouter();
  // Duplicate blanks lot_number/arrival_date/notes/est_purchase_weight_lb/est_weight_source
  // (index.html:9872-9885) -- everything else, including the assumption columns, is copied
  // server-side in saveLotInfo rather than pre-filled here, matching vanilla's own re-read.
  const [form, setForm] = useState<LotFormInput>({
    lotNumber: mode === "duplicate" ? "" : lotNumber,
    arrivalDate: mode === "duplicate" ? "" : editDetail?.arrival_date ?? todayIso(),
    source: mode === "duplicate" ? null : editDetail?.source ?? null,
    sexClass: mode === "duplicate" ? null : editDetail?.sex_class ?? null,
    targetAdg: mode === "duplicate" ? null : editDetail?.target_adg ?? null,
    notes: mode === "duplicate" ? null : editDetail?.notes ?? null,
    estPurchaseWeightLb: mode === "duplicate" ? null : editDetail?.est_purchase_weight_lb ?? null,
    estWeightSource: mode === "duplicate" ? null : editDetail?.est_weight_source ?? null,
    noPrecon: mode === "duplicate" ? !!editDetail?.no_precon : !!editDetail?.no_precon,
  });
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await saveLotInfo(mode, mode === "edit" ? lotId : null, lotId, form);
      if (!result.ok) {
        setMessage({ tone: "error", text: result.message });
        return;
      }
      onClose();
      if (result.lotNumber && result.lotNumber !== lotNumber) {
        router.push(`/lots/${encodeURIComponent(result.lotNumber)}`);
      }
    });
  }

  return (
    <Dialog open onClose={onClose} title={mode === "edit" ? "Edit lot" : "Duplicate lot"} className="max-w-xl">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Lot number
          <Input value={form.lotNumber} onChange={(e) => setForm((f) => ({ ...f, lotNumber: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Arrival date
          <Input type="date" value={form.arrivalDate} onChange={(e) => setForm((f) => ({ ...f, arrivalDate: e.target.value }))} />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Source
            <Input className="w-40" value={form.source ?? ""} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Sex class
            <Input className="w-32" value={form.sexClass ?? ""} onChange={(e) => setForm((f) => ({ ...f, sexClass: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Target ADG
            <Input
              type="number"
              step="0.01"
              className="w-24"
              value={form.targetAdg ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, targetAdg: e.target.value ? parseFloat(e.target.value) : null }))}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Est. purchase weight (lb/hd) {mode === "duplicate" && <span className="text-[#a12525]">*</span>}
            <Input
              type="number"
              className="w-32"
              value={form.estPurchaseWeightLb ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, estPurchaseWeightLb: e.target.value ? parseFloat(e.target.value) : null }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Est. weight source
            <Input className="w-40" value={form.estWeightSource ?? ""} onChange={(e) => setForm((f) => ({ ...f, estWeightSource: e.target.value }))} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={form.noPrecon} onChange={(e) => setForm((f) => ({ ...f, noPrecon: e.target.checked }))} />
          No precon
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

function CloseLotDialog({ lotNumber, lotId, closing, onClose }: { lotNumber: string; lotId: string; closing: boolean; onClose: () => void }) {
  const [unweighed, setUnweighed] = useState<UnweighedSale[] | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function attempt(confirmUnweighedSales?: boolean) {
    startTransition(async () => {
      const result = await closeOrReopenLot(lotId, lotNumber, closing, confirmUnweighedSales);
      if (result.needsSalesConfirm) {
        setUnweighed(result.unweighedSales ?? []);
        setMessage({ tone: "error", text: result.message });
        return;
      }
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) onClose();
    });
  }

  return (
    <Dialog open onClose={onClose} title={closing ? "Close lot" : "Re-open lot"}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground">
          Are you sure you want to {closing ? "close" : "re-open"} lot {lotNumber}?
        </p>

        {unweighed && unweighed.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md border border-[#b58900] bg-[#b58900]/10 p-2">
            {unweighed.map((s) => (
              <p key={s.id} className="text-xs text-foreground">
                {formatDate(s.sale_date)} · {formatNumber(s.head_count)} hd · {s.buyer ?? "no buyer"}
                {s.gross_weight_lb && Number(s.gross_weight_lb) > 0 ? " · gross only" : " · no weight"}
              </p>
            ))}
          </div>
        )}

        {message && <p className={`text-sm ${message.tone === "error" ? "text-[#a12525]" : "text-muted-foreground"}`}>{message.text}</p>}

        <div className="flex gap-2">
          {unweighed && unweighed.length > 0 ? (
            <>
              <Button type="button" disabled={isPending} onClick={() => attempt(true)}>
                {isPending ? "Working…" : "Mark & close"}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button type="button" disabled={isPending} onClick={() => attempt()}>
                {isPending ? "Working…" : "Confirm"}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { daysBetween, type CloseoutRates } from "./closeout-math";
import { saveCloseoutAssumptions, type CloseoutAssumptionsInput } from "./actions/closeout";

interface FormState {
  salePerLb: string;
  adg: string;
  shipDate: string;
  cog: string;
  nonFeedCog: string;
  labor: string;
  laborMode: "per_day" | "per_head";
  procPerHead: string;
  docPerHead: string;
  deathPctWhole: string;
  intPctWhole: string;
}

function toForm(rates: CloseoutRates): FormState {
  return {
    salePerLb: rates.salePerLb?.toString() ?? "",
    adg: rates.adg?.toString() ?? "",
    shipDate: rates.shipDate ?? "",
    cog: rates.cog?.toString() ?? "",
    nonFeedCog: rates.nonFeedCog?.toString() ?? "",
    labor: rates.labor?.toString() ?? "",
    laborMode: rates.laborMode,
    procPerHead: rates.procPerHead?.toString() ?? "",
    docPerHead: rates.docPerHead?.toString() ?? "",
    deathPctWhole: rates.deathPct != null ? (rates.deathPct * 100).toFixed(2) : "",
    intPctWhole: rates.intPct != null ? (rates.intPct * 100).toFixed(2) : "",
  };
}

function num(s: string): number | null {
  const v = parseFloat(s);
  return Number.isNaN(v) ? null : v;
}

/**
 * Ported from the Working Assumptions box + Save/Reset (index.html:9131-9199, 9827-9866).
 * `daysOnFeed` has no input box of its own here -- it's a derived display, recomputed from the
 * ship date exactly like the vanilla app's hidden `calc_days` field does whenever the ship date
 * changes (index.html:9177-9181), falling back to the lot's own saved value when no ship date is
 * set at all.
 */
export function CloseoutAssumptionsForm({
  lotId,
  lotNumber,
  arrivalDate,
  savedDaysOnFeed,
  rates,
}: {
  lotId: string;
  lotNumber: string;
  arrivalDate: string | null;
  savedDaysOnFeed: number | null;
  rates: CloseoutRates;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toForm(rates));
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const daysOnFeed = useMemo(() => {
    if (form.shipDate && arrivalDate) return daysBetween(arrivalDate, form.shipDate);
    return savedDaysOnFeed;
  }, [form.shipDate, arrivalDate, savedDaysOnFeed]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSave() {
    const input: CloseoutAssumptionsInput = {
      salePerLb: num(form.salePerLb),
      adg: num(form.adg),
      shipDate: form.shipDate || null,
      daysOnFeed,
      cog: num(form.cog),
      nonFeedCog: form.nonFeedCog ? num(form.nonFeedCog) : null,
      labor: num(form.labor),
      laborMode: form.laborMode,
      procPerHead: num(form.procPerHead),
      docPerHead: num(form.docPerHead),
      deathPctWhole: form.deathPctWhole ? num(form.deathPctWhole) : null,
      intPctWhole: form.intPctWhole ? num(form.intPctWhole) : null,
    };
    startTransition(async () => {
      const result = await saveCloseoutAssumptions(lotId, lotNumber, arrivalDate, input);
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      if (result.ok) router.refresh();
    });
  }

  function handleReset() {
    setForm(toForm(rates));
    setMessage(null);
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium text-foreground">
        Working assumptions <span className="font-normal text-xs text-muted-foreground">(drive the projection)</span>
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Target sale $/lb
          <Input type="number" step="0.0001" value={form.salePerLb} onChange={(e) => set("salePerLb", e.target.value)} placeholder="e.g. 4.95" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Target ADG (lb/day)
          <Input type="number" step="0.01" value={form.adg} onChange={(e) => set("adg", e.target.value)} placeholder="e.g. 2.50" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Target ship date
          <Input type="date" value={form.shipDate} onChange={(e) => set("shipDate", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Days on feed <span className="text-[10px]">(from ship date)</span>
          <Input type="number" value={daysOnFeed ?? ""} disabled />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          COG $/lb of gain <span className="text-[10px]">(feed and non-feed together)</span>
          <Input type="number" step="0.0001" value={form.cog} onChange={(e) => set("cog", e.target.value)} placeholder="e.g. 0.55" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          Non-feed COG $/head/day <span className="text-[10px]">(blank keeps COG as one number that includes feed)</span>
          <Input type="number" step="0.0001" value={form.nonFeedCog} onChange={(e) => set("nonFeedCog", e.target.value)} placeholder="e.g. 0.50" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          Labor
          <div className="flex gap-2">
            <select
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              value={form.laborMode}
              onChange={(e) => set("laborMode", e.target.value as "per_day" | "per_head")}
            >
              <option value="per_day">$/head/day</option>
              <option value="per_head">$/head (flat)</option>
            </select>
            <Input type="number" step="0.0001" value={form.labor} onChange={(e) => set("labor", e.target.value)} placeholder={form.laborMode === "per_day" ? "e.g. 0.35" : "e.g. 31.81"} />
          </div>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Processing $/head
          <Input type="number" step="0.01" value={form.procPerHead} onChange={(e) => set("procPerHead", e.target.value)} placeholder="e.g. 38.00" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Doctoring $/head
          <Input type="number" step="0.01" value={form.docPerHead} onChange={(e) => set("docPerHead", e.target.value)} placeholder="e.g. 12.00" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Death loss % <span className="text-[10px]">(whole lot)</span>
          <Input type="number" step="0.01" value={form.deathPctWhole} onChange={(e) => set("deathPctWhole", e.target.value)} placeholder="e.g. 6" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Interest %
          <Input type="number" step="0.01" value={form.intPctWhole} onChange={(e) => set("intPctWhole", e.target.value)} placeholder="e.g. 5" />
        </label>
      </div>
      {message && <p className={`text-sm ${message.tone === "error" ? "text-[#a12525]" : "text-muted-foreground"}`}>{message.text}</p>}
      <div className="flex gap-2">
        <Button type="button" disabled={isPending} onClick={handleSave}>
          {isPending ? "Saving…" : "Save to lot"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={handleReset}>
          Reset
        </Button>
      </div>
    </div>
  );
}

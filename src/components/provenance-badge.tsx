import { PROVENANCE, type Provenance } from "@/lib/theme/colors";
import { cn } from "@/lib/utils";

const LABEL: Record<Provenance, string> = {
  measured: "MEASURED",
  sourced: "SOURCED",
  modeled: "MODELED",
  assumed: "ASSUMED",
};

const TITLE: Record<Provenance, string> = {
  measured: "Scale ticket, invoice, or GL posting",
  sourced: "CME settle or cash bid",
  modeled: "Derived — e.g. weight from ADG, cost from head-days",
  assumed: "Projected — e.g. flat ADG, assumed death-loss %",
};

/**
 * Position Desk spec Rule 1: every number carries a provenance label so the
 * reader always knows whether it was weighed or guessed.
 */
export function ProvenanceBadge({ provenance, className }: { provenance: Provenance; className?: string }) {
  return (
    <span
      title={TITLE[provenance]}
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
        className
      )}
      style={{ borderColor: PROVENANCE[provenance], color: PROVENANCE[provenance] }}
    >
      {LABEL[provenance]}
    </span>
  );
}

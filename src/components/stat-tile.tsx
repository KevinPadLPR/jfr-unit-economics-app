import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProvenanceBadge } from "@/components/provenance-badge";
import type { Provenance } from "@/lib/theme/colors";
import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "good" | "bad" | "neutral";
  provenance?: Provenance;
  className?: string;
}

/**
 * Deliberately icon-free — the K4 Ranches reference app removed icons from
 * these tiles after client feedback that they "read as emoji clutter."
 */
export function StatTile({ label, value, delta, deltaTone = "neutral", provenance, className }: StatTileProps) {
  return (
    <Card className={cn("border-border", className)}>
      <CardHeader className="gap-1.5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardDescription>{label}</CardDescription>
          {provenance && <ProvenanceBadge provenance={provenance} />}
        </div>
        <CardTitle className="text-2xl text-foreground">{value}</CardTitle>
        {delta && (
          <span
            className={cn(
              "text-xs font-medium",
              deltaTone === "good" && "text-[#0a7c0a]",
              deltaTone === "bad" && "text-[#a12525]",
              deltaTone === "neutral" && "text-muted-foreground"
            )}
          >
            {delta}
          </span>
        )}
      </CardHeader>
    </Card>
  );
}

import { getLotScorecard } from "@/lib/data/scorecard";
import { ScorecardTable } from "./scorecard-table";

export const dynamic = "force-dynamic";

export default async function LotScorecardPage() {
  const rows = getLotScorecard();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Lot Scorecard</h1>
        <p className="text-sm text-muted-foreground">
          Every lot ever seen — open and closed — for benchmarking lot-over-lot and year-over-year. Confidence
          reflects whether a lot has real app-sourced weight/ADG data or falls back to the flat Lot Master
          assumption.
        </p>
      </div>
      <ScorecardTable rows={rows} />
    </div>
  );
}

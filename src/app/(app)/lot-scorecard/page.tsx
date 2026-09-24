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
          Every lot, open and closed, side by side so you can compare how each one performed.
        </p>
      </div>
      <ScorecardTable rows={rows} />
    </div>
  );
}

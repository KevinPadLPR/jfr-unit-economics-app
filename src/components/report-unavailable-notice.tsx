import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export function ReportUnavailableNotice({ detail }: { detail?: string }) {
  return (
    <Card className="border-[color-mix(in_srgb,var(--status-warning)_50%,var(--border))] bg-[color-mix(in_srgb,var(--status-warning)_8%,white)]">
      <CardContent className="flex items-start gap-3 pt-4">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#8a5a00]" />
        <div className="text-sm text-[#5c3d00]">
          <p className="font-medium">This report isn&apos;t available right now.</p>
          <p className="text-[#8a5a00]">
            {detail ?? "The data source is being regenerated. Try again shortly, or check the data pipeline."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

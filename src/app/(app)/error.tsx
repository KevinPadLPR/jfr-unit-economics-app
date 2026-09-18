"use client";

import { ReportUnavailableNotice } from "@/components/report-unavailable-notice";

export default function AppError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="p-8">
      <ReportUnavailableNotice
        detail={
          error.message.includes("Dev database not found")
            ? "The dashboard's data source isn't configured yet in this environment (no data/dev.sqlite and no live Supabase connection). Run the setup steps in README.md, or wire up DATA_SOURCE=supabase once the sync job is ready."
            : "Something went wrong loading this report. Try refreshing, or check the server logs."
        }
      />
    </div>
  );
}

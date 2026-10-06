"use client";

import { ReportUnavailableNotice } from "@/components/report-unavailable-notice";

export default function AppError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="p-8">
      <ReportUnavailableNotice
        detail={
          error.message.includes("SUPABASE")
            ? "Can't reach the client's Supabase project from this environment -- check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local."
            : "Something went wrong loading this report. Try refreshing, or check the server logs."
        }
      />
    </div>
  );
}

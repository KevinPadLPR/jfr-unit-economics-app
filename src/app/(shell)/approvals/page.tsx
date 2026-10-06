import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { canWriteApprovals } from "@/lib/roles";
import { loadApprovalLookups } from "./lookups";
import { resolveApprovalEntry, flagDuplicateApprovals, type PendingFieldEntry } from "./resolve";
import { ApprovalsTable } from "./approvals-table";

export const dynamic = "force-dynamic";

/**
 * Ported from loadApprovals() (public/client-app/index.html:10967-10989). Field-entries pane
 * only -- the Approvals tab's apprFeedPane (PB delivery/feed) and apprMedsPane (med invoice
 * intake) are a different, larger system and explicitly out of scope for this phase.
 */
export default async function ApprovalsPage() {
  const session = await getSession();
  if (!session) return null; // (shell)/layout.tsx already redirects; defensive only.

  const supabase = await createClient();
  const [{ data: entries, error }, lookups] = await Promise.all([
    supabase
      .from("pending_field_entries")
      .select(
        "id, entry_type, client_id, raw, status, review_notes, submitted_at, submitted_by, " +
          "event_datetime, lot_id, pasture_id, to_pasture_id, field_action_id, " +
          "tag_number, no_tag, head_count, resolved_meds, resolved_detail"
      )
      .eq("status", "pending")
      .order("event_datetime", { ascending: true }),
    loadApprovalLookups(),
  ]);
  if (error) throw error;

  const resolved = ((entries ?? []) as unknown as PendingFieldEntry[]).map((e) => resolveApprovalEntry(e, lookups));
  await flagDuplicateApprovals(resolved, async (lotIds) => {
    const { data } = await supabase.from("doctoring_events").select("tag_number, lot_id, field_action_id").in("lot_id", lotIds);
    return data ?? [];
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Field entries waiting on review — doctoring, deaths, moves, counts and test weights.
        </p>
      </div>
      <ApprovalsTable rows={resolved} canWrite={canWriteApprovals(session.user.role)} />
    </div>
  );
}

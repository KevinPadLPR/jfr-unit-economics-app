"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

/**
 * Owner-only inline-confirm delete, reused for death / head-adjustment / move rows -- all
 * three are "one RPC, owner-only, reverses and restores head" shapes, matching the same
 * inline Confirm/Cancel pattern ApprovalsTable already uses for Reject.
 */
export function DeleteEventButton({
  eventId,
  isOwner,
  action,
}: {
  eventId: string;
  isOwner: boolean;
  action: (eventId: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOwner) return null;

  function handleDelete() {
    startTransition(async () => {
      const result = await action(eventId);
      setMessage(result.message);
      if (result.ok) setConfirming(false);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {confirming ? (
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-[#a12525] text-[#a12525] hover:bg-[#a12525]/10"
            disabled={isPending}
            onClick={handleDelete}
          >
            Confirm
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>
          Delete
        </Button>
      )}
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}

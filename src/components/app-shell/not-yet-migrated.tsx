/** Shared placeholder for a nav tab Phase 1 reserves the route for but doesn't port yet. */
export function NotYetMigrated({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-8 text-center">
      <p className="text-lg font-medium text-foreground">{label} isn&apos;t migrated yet</p>
      <p className="text-sm text-muted-foreground">
        This module is still the vanilla-JS client app in a future phase of the migration.
      </p>
    </div>
  );
}

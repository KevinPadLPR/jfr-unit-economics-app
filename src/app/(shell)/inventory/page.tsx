import { NotYetMigrated } from "@/components/app-shell/not-yet-migrated";

// Note: this is the client app's operational feed/commodity Inventory tab (navInventory) --
// a different concept from /dashboard/inventory (the Unit Economics cattle-flow dashboard
// page, already built). Don't merge the two without a deliberate decision in a later phase.
export default function InventoryPage() {
  return <NotYetMigrated label="Inventory" />;
}

import { createClient } from "@/lib/supabase/server";

export interface ActivePasture {
  id: string;
  name: string;
  ranch_name: string | null;
}

/**
 * Every active pasture -- the "+ Move" destination list and the stray-return pasture list
 * (a stray can be found anywhere, per the vanilla app's own grouping at index.html:26282-26303).
 * Same table/columns as `approvals/lookups.ts`'s existing pasture read, scoped down to active
 * only since this page's write modals never need to target a retired pasture.
 */
export async function getActivePastures(): Promise<ActivePasture[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pastures")
    .select("id, name, is_active, ranches(name)")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((p) => {
    const ranch = p.ranches as unknown as { name: string | null } | null;
    return { id: p.id, name: p.name, ranch_name: ranch?.name ?? null };
  });
}

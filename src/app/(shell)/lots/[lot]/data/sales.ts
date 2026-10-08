import { createClient } from "@/lib/supabase/server";

export interface SaleSource {
  head_count: number | null;
  pasture_name: string | null;
  ranch_name: string | null;
}
export interface Sale {
  id: string;
  sale_date: string | null;
  buyer: string | null;
  head_count: number | null;
  gross_weight_lb: number | null;
  net_weight_lb: number | null;
  price_per_cwt: number | null;
  price_per_head: number | null;
  total_price: number | null;
  notes: string | null;
  sources: SaleSource[];
}

interface RawSource {
  head_count: number | null;
  pastures: { name: string | null; ranches: { name: string | null } | null } | null;
}
interface RawSale {
  id: string;
  sale_date: string | null;
  buyer: string | null;
  head_count: number | null;
  gross_weight_lb: number | null;
  net_weight_lb: number | null;
  price_per_cwt: number | null;
  price_per_head: number | null;
  total_price: number | null;
  notes: string | null;
  sale_sources: RawSource[] | null;
}

/** Ported from loadSales() (public/client-app/index.html:29825-29830). */
export async function getSales(lotId: string): Promise<Sale[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales")
    .select(
      "id, sale_date, buyer, head_count, gross_weight_lb, net_weight_lb, price_per_cwt, price_per_head, " +
        "total_price, notes, sale_sources(head_count, pastures(name, ranches(name)))"
    )
    .eq("lot_id", lotId)
    .order("sale_date", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as RawSale[]).map((s) => ({
    id: s.id,
    sale_date: s.sale_date,
    buyer: s.buyer,
    head_count: s.head_count,
    gross_weight_lb: s.gross_weight_lb,
    net_weight_lb: s.net_weight_lb,
    price_per_cwt: s.price_per_cwt,
    price_per_head: s.price_per_head,
    total_price: s.total_price,
    notes: s.notes,
    sources: (s.sale_sources ?? []).map((src) => ({
      head_count: src.head_count,
      pasture_name: src.pastures?.name ?? null,
      ranch_name: src.pastures?.ranches?.name ?? null,
    })),
  }));
}

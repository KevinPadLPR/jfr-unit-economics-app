"use client";

import { useRouter } from "next/navigation";
import { FilterSelect } from "@/components/filter-select";

export function LotDetailPicker({ lots, current }: { lots: { lot: string; status: string | null }[]; current: string }) {
  const router = useRouter();

  return (
    <FilterSelect
      label="Lot"
      value={current}
      options={lots.map((l) => ({ value: l.lot, label: `${l.lot}${l.status ? ` (${l.status})` : ""}` }))}
      onChange={(value) => router.push(`/lots/${encodeURIComponent(value)}`)}
      className="w-64"
      allowAll={false}
    />
  );
}

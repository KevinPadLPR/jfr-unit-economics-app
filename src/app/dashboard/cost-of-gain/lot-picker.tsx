"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FilterSelect } from "@/components/filter-select";

export function LotPicker({ lots }: { lots: { lot: string; status: string | null }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("lot") ?? lots[0]?.lot ?? "";

  return (
    <FilterSelect
      label="Lot"
      value={current}
      options={lots.map((l) => ({ value: l.lot, label: `${l.lot}${l.status ? ` (${l.status})` : ""}` }))}
      onChange={(value) => router.push(`${pathname}?lot=${encodeURIComponent(value)}`)}
      className="w-64"
      allowAll={false}
    />
  );
}

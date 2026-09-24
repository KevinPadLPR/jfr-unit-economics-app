"use client";

import { useRouter, usePathname } from "next/navigation";
import { FilterSelect } from "@/components/filter-select";
import { formatDate } from "@/lib/format";

export function MonthPicker({ months, current }: { months: string[]; current: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <FilterSelect
      label="Month"
      value={current}
      options={months.map((m) => ({ value: m, label: formatDate(m) }))}
      onChange={(value) => router.push(`${pathname}?month=${encodeURIComponent(value)}`)}
      className="w-48"
      allowAll={false}
    />
  );
}

"use client";

import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export const ALL = "__all__";

interface FilterSelectProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
  /** Set false for a required single-choice picker (e.g. "pick a lot") with no "All" state. */
  allowAll?: boolean;
}

/**
 * Shared filter dropdown — the K4 Ranches reference app duplicated this same
 * component verbatim across two pages; we don't repeat that here.
 */
export function FilterSelect({ label, value, options, onChange, className, allowAll = true }: FilterSelectProps) {
  return (
    <label className={cn("flex flex-col gap-1 text-xs text-muted-foreground", className)}>
      {label}
      <div className="relative">
        <select
          className="h-9 w-full appearance-none rounded-md border border-input bg-card px-3 pr-8 text-sm text-foreground"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {allowAll && <option value={ALL}>All</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
    </label>
  );
}

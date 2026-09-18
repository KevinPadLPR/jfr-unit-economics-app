import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "border-border bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        good: "border-transparent bg-[color-mix(in_srgb,var(--status-good)_15%,white)] text-[#0a7c0a]",
        warning: "border-transparent bg-[color-mix(in_srgb,var(--status-warning)_20%,white)] text-[#8a5a00]",
        critical: "border-transparent bg-[color-mix(in_srgb,var(--status-critical)_15%,white)] text-[#a12525]",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

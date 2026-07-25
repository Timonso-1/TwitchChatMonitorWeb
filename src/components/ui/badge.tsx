import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap leading-5",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]",
        primary: "bg-[color-mix(in_srgb,var(--color-brand)_18%,transparent)] text-[var(--color-brand)]",
        secondary: "bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]",
        outline: "border border-[var(--color-border-strong)] text-[var(--color-muted-foreground)]",
        muted: "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
        success: "bg-[color-mix(in_srgb,var(--color-success)_16%,transparent)] text-[var(--color-success)]",
        warning: "bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] text-[var(--color-warning)]",
        info: "bg-[color-mix(in_srgb,var(--color-info)_16%,transparent)] text-[var(--color-info)]",
        destructive: "bg-[color-mix(in_srgb,var(--color-destructive)_18%,transparent)] text-[var(--color-destructive)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva("flex gap-2.5 rounded-md border px-3.5 py-2.5 text-sm", {
  variants: {
    variant: {
      default: "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)]",
      info: "border-[color-mix(in_srgb,var(--color-info)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-info)_10%,transparent)] text-[var(--color-foreground)]",
      success:
        "border-[color-mix(in_srgb,var(--color-success)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] text-[var(--color-foreground)]",
      warning:
        "border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] text-[var(--color-foreground)]",
      destructive:
        "border-[color-mix(in_srgb,var(--color-destructive)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] text-[var(--color-foreground)]",
    },
  },
  defaultVariants: { variant: "default" },
});

const ICONS = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: XCircle,
} as const;

const ICON_COLORS: Record<keyof typeof ICONS, string> = {
  default: "text-[var(--color-muted-foreground)]",
  info: "text-[var(--color-info)]",
  success: "text-[var(--color-success)]",
  warning: "text-[var(--color-warning)]",
  destructive: "text-[var(--color-destructive)]",
};

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  title?: string;
  hideIcon?: boolean;
}

function Alert({ className, variant = "default", title, hideIcon, children, ...props }: AlertProps) {
  const key = (variant ?? "default") as keyof typeof ICONS;
  const Icon = ICONS[key];

  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      {!hideIcon && <Icon className={cn("mt-0.5 size-4 shrink-0", ICON_COLORS[key])} aria-hidden />}
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-medium leading-tight">{title}</p>}
        {children && <div className="leading-relaxed text-[var(--color-muted-foreground)]">{children}</div>}
      </div>
    </div>
  );
}

export { Alert, alertVariants };

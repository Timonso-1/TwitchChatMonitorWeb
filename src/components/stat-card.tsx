import type { LucideIcon } from "lucide-react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";

type Accent = "neutral" | "brand" | "success" | "warning" | "destructive" | "info";

interface StatCardProps {
  label: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  accent?: Accent;
  /** Prozentuale Veraenderung gegenueber der Vorperiode. */
  trend?: number | null;
  /** Beschreibt, worauf sich der Trend bezieht (nur als Titel-Attribut). */
  trendLabel?: string;
  /** Groessere Darstellung fuer hervorgehobene Kennzahlen. */
  size?: "default" | "large";
  className?: string;
}

const ACCENT_CLASSES: Record<Accent, string> = {
  neutral: "text-[var(--color-muted-foreground)] bg-[var(--color-muted)]",
  brand: "text-[var(--color-brand)] bg-[color-mix(in_srgb,var(--color-brand)_14%,transparent)]",
  success: "text-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)]",
  warning: "text-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)]",
  destructive: "text-[var(--color-destructive)] bg-[color-mix(in_srgb,var(--color-destructive)_14%,transparent)]",
  info: "text-[var(--color-info)] bg-[color-mix(in_srgb,var(--color-info)_14%,transparent)]",
};

/** Ab diesem Betrag wird der Wert gedeckelt statt ausgeschrieben. */
const TREND_CAP = 999;

/** Kleines Abzeichen mit Auf- oder Abwaertstrend. */
function TrendBadge({ value, label }: { value: number; label?: string }) {
  const rising = value > 0;
  const flat = value === 0;
  const Icon = flat ? Minus : rising ? TrendingUp : TrendingDown;

  // Extremwerte entstehen bei kleiner Vergleichsbasis – lieber deckeln als irrefuehren.
  const capped = Math.abs(value) > TREND_CAP;
  const text = capped ? `${value > 0 ? ">+" : "<−"}${TREND_CAP} %` : `${value > 0 ? "+" : ""}${value} %`;

  return (
    <span
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        flat && "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
        rising && "bg-[color-mix(in_srgb,var(--color-success)_16%,transparent)] text-[var(--color-success)]",
        !rising && !flat && "bg-[color-mix(in_srgb,var(--color-destructive)_16%,transparent)] text-[var(--color-destructive)]",
      )}
    >
      <Icon className="size-3" />
      {text}
    </span>
  );
}

/**
 * Kennzahlenkachel mit Icon links, optionalem Trend rechts oben.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "neutral",
  trend,
  trendLabel,
  size = "default",
  className,
}: StatCardProps) {
  const large = size === "large";

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] ring-inset-subtle",
        large ? "px-5 py-5" : "px-4 py-3.5",
        className,
      )}
    >
      {Icon && (
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md",
            large ? "size-11" : "size-9",
            ACCENT_CLASSES[accent],
          )}
        >
          <Icon className={large ? "size-5" : "size-4"} />
        </div>
      )}

      <div className="min-w-0 flex-1 space-y-0.5">
        <p className={cn("truncate font-semibold leading-tight tabular-nums", large ? "text-2xl" : "text-lg")}>
          {typeof value === "number" ? formatNumber(value) : value}
        </p>
        <p className="truncate text-xs text-[var(--color-muted-foreground)]">{label}</p>
        {hint && <p className="truncate text-xs text-[var(--color-subtle)]">{hint}</p>}
      </div>

      {trend !== null && trend !== undefined && (
        <div className="absolute right-3 top-3">
          <TrendBadge value={trend} label={trendLabel} />
        </div>
      )}
    </div>
  );
}

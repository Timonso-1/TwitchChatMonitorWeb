import { cn, formatNumber } from "@/lib/utils";

export interface DistributionBar {
  /** Beschriftung unter dem Balken. */
  label: string;
  /** Ausführliche Beschriftung für den Tooltip. */
  fullLabel?: string;
  value: number;
  /** Hebt den Balken hervor, z. B. den aktuellen Wochentag. */
  highlighted?: boolean;
}

interface DistributionChartProps {
  bars: DistributionBar[];
  /** Einheit im Tooltip, z. B. "Nachrichten". */
  unit?: string;
  height?: number;
  accent?: "brand" | "success" | "info" | "warning";
  /**
   * Nur jede n-te Beschriftung anzeigen. Bei 24 Stunden sonst zu eng.
   * Der erste und letzte Eintrag werden immer beschriftet.
   */
  labelEvery?: number;
  emptyMessage?: string;
}

const ACCENT_CLASSES: Record<NonNullable<DistributionChartProps["accent"]>, { bar: string; peak: string }> = {
  brand: { bar: "bg-[color-mix(in_srgb,var(--color-brand)_55%,transparent)]", peak: "bg-[var(--color-brand)]" },
  success: { bar: "bg-[color-mix(in_srgb,var(--color-success)_55%,transparent)]", peak: "bg-[var(--color-success)]" },
  info: { bar: "bg-[color-mix(in_srgb,var(--color-info)_55%,transparent)]", peak: "bg-[var(--color-info)]" },
  warning: { bar: "bg-[color-mix(in_srgb,var(--color-warning)_55%,transparent)]", peak: "bg-[var(--color-warning)]" },
};

/**
 * Verteilungsdiagramm für feste Kategorien (Wochentage, Stunden).
 *
 * Bewusst ohne Chart-Bibliothek: bei einer festen, kleinen Kategorienzahl
 * ist eine CSS-Darstellung robuster – sie bricht nicht bei einem einzigen
 * Datenpunkt zusammen und die Beschriftung bleibt immer lesbar.
 */
export function DistributionChart({
  bars,
  unit = "Nachrichten",
  height = 140,
  accent = "brand",
  labelEvery = 1,
  emptyMessage,
}: DistributionChartProps) {
  const max = Math.max(...bars.map((bar) => bar.value), 0);
  const total = bars.reduce((sum, bar) => sum + bar.value, 0);
  const colors = ACCENT_CLASSES[accent];

  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted-foreground)]"
        style={{ height: height + 28 }}
      >
        {emptyMessage ?? "Noch keine Aktivität aufgezeichnet."}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end gap-1" style={{ height }}>
        {bars.map((bar, index) => {
          const isPeak = bar.value === max && max > 0;
          // Leere Kategorien bekommen einen Reststrich, damit die Lücke sichtbar bleibt.
          const percent = max > 0 ? (bar.value / max) * 100 : 0;
          const barHeight = bar.value === 0 ? 2 : Math.max(4, percent);

          return (
            <div key={`${bar.label}-${index}`} className="group flex h-full flex-1 flex-col justify-end gap-1">
              {/* Wert erscheint beim Überfahren über dem Balken */}
              <span className="text-center text-[0.65rem] tabular-nums text-[var(--color-muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100">
                {formatNumber(bar.value)}
              </span>

              <div
                title={`${bar.fullLabel ?? bar.label}: ${formatNumber(bar.value)} ${unit}`}
                className={cn(
                  "w-full rounded-sm transition-colors",
                  bar.value === 0 ? "bg-[var(--color-border)]" : isPeak ? colors.peak : colors.bar,
                  bar.value > 0 && "group-hover:bg-[var(--color-foreground)]",
                  bar.highlighted && "ring-1 ring-[var(--color-foreground)] ring-offset-1 ring-offset-[var(--color-card)]",
                )}
                style={{ height: `${barHeight}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex gap-1 pt-1.5">
        {bars.map((bar, index) => {
          const showLabel = labelEvery <= 1 || index % labelEvery === 0 || index === bars.length - 1;

          return (
            <span
              key={`label-${bar.label}-${index}`}
              className={cn(
                "flex-1 text-center text-[0.65rem] tabular-nums",
                bar.value === max && max > 0
                  ? "font-medium text-[var(--color-foreground)]"
                  : "text-[var(--color-subtle)]",
              )}
            >
              {showLabel ? bar.label : " "}
            </span>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { cn, formatNumber } from "@/lib/utils";

/** Farbrollen, die auf die CSS-Variablen des aktiven Themes zeigen. */
export type ChartColor = "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5";

export const CHART_COLOR_VARS: Record<ChartColor, string> = {
  "chart-1": "var(--color-chart-1)",
  "chart-2": "var(--color-chart-2)",
  "chart-3": "var(--color-chart-3)",
  "chart-4": "var(--color-chart-4)",
  "chart-5": "var(--color-chart-5)",
};

export interface SeriesConfig {
  /** Schluessel im Datensatz. */
  key: string;
  label: string;
  color: ChartColor;
  /** Einheit fuer Legende und Tooltip, z. B. "Nachrichten". */
  unit?: string;
}

/**
 * Formatierung wird als Name uebergeben statt als Funktion.
 * Server Components duerfen keine Funktionen an Client Components reichen –
 * deshalb loest der Client den Namen selbst auf.
 */
export type AxisFormat =
  | "none"
  | "date"
  | "time"
  | "datetime"
  | "weekday-long"
  | "date-long"
  /** Nimmt die ersten beiden Zeichen, z. B. "08 Uhr" → "08". */
  | "hour-short";

export type ValueFormat = "number" | "duration-minutes";

function toDate(value: string | number): Date | null {
  const date = new Date(typeof value === "number" ? value : String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Wendet ein benanntes Achsenformat an. */
export function applyAxisFormat(value: string | number, format: AxisFormat = "none"): string {
  const raw = String(value);
  if (format === "none") return raw;
  if (format === "hour-short") return raw.slice(0, 2);

  const date = toDate(value);
  if (!date) return raw;

  switch (format) {
    case "date":
      return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
    case "time":
      return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    case "datetime":
      return date.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    case "weekday-long":
      return date.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "long" });
    case "date-long":
      return date.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
    default:
      return raw;
  }
}

export function applyValueFormat(value: number, format: ValueFormat = "number"): string {
  if (format === "duration-minutes") {
    if (value < 60) return `${formatNumber(value)} min`;
    const hours = Math.floor(value / 60);
    const minutes = Math.round(value % 60);
    return minutes > 0 ? `${formatNumber(hours)} h ${minutes} min` : `${formatNumber(hours)} h`;
  }

  return formatNumber(value);
}

interface TooltipPayloadEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  labelFormat?: AxisFormat;
  valueFormat?: ValueFormat;
}

/** Einheitlicher Tooltip fuer alle Diagramme. */
export function ChartTooltip({ active, payload, label, labelFormat, valueFormat }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-popover)] px-3 py-2 text-xs shadow-overlay">
      {label !== undefined && (
        <p className="mb-1.5 font-medium text-[var(--color-foreground)]">{applyAxisFormat(label, labelFormat)}</p>
      )}

      <div className="space-y-1">
        {payload.map((entry, index) => {
          const key = String(entry.dataKey ?? entry.name ?? index);
          const numeric = typeof entry.value === "number" ? entry.value : Number(entry.value ?? 0);

          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-[var(--color-muted-foreground)]">
                <span
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: entry.color ?? "var(--color-chart-1)" }}
                />
                {String(entry.name ?? key)}
              </span>
              <span className="font-medium tabular-nums text-[var(--color-foreground)]">
                {applyValueFormat(numeric, valueFormat)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Legende unter dem Diagramm. */
export function ChartLegend({
  series,
  className,
  /** Auch bei einer einzelnen Serie anzeigen. */
  always,
}: {
  series: SeriesConfig[];
  className?: string;
  always?: boolean;
}) {
  if (series.length <= 1 && !always) return null;

  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-4 pt-3", className)}>
      {series.map((entry) => (
        <span key={entry.key} className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
          <span className="size-2 rounded-[2px]" style={{ backgroundColor: CHART_COLOR_VARS[entry.color] }} />
          {entry.label}
          {entry.unit && <span className="text-[var(--color-subtle)]">({entry.unit})</span>}
        </span>
      ))}
    </div>
  );
}

/** Beschriftung einer Achse, dezent unter bzw. neben dem Diagramm. */
export function AxisCaption({ children, align = "center" }: { children: React.ReactNode; align?: "left" | "center" }) {
  return (
    <p
      className={cn(
        "pt-1 text-xs text-[var(--color-subtle)]",
        align === "center" ? "text-center" : "text-left",
      )}
    >
      {children}
    </p>
  );
}

/** Platzhalter, wenn keine Daten vorliegen. */
export function ChartEmpty({ height, message }: { height: number; message?: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-md border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted-foreground)]"
      style={{ height }}
    >
      {message ?? "Keine Daten im gewählten Zeitraum."}
    </div>
  );
}

/**
 * Verhindert, dass Recharts vor der Hydration mit Breite 0 rendert.
 * Erst nach dem Mount wird das Diagramm eingeblendet.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return mounted;
}

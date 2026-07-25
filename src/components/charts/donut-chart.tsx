"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_COLOR_VARS, ChartEmpty, useMounted, type ChartColor } from "./chart-primitives";
import { formatNumber } from "@/lib/utils";

const DEFAULT_COLORS: ChartColor[] = ["chart-2", "chart-3", "chart-4", "chart-5", "chart-1"];

interface DonutTooltipProps {
  active?: boolean;
  payload?: Array<{ name?: string | number; value?: number; payload?: { fill?: string } }>;
  total: number;
}

/** Eigener Tooltip mit Prozentanteil am Gesamtwert. */
function DonutTooltip({ active, payload, total }: DonutTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const entry = payload[0];
  const value = entry.value ?? 0;
  const share = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-popover)] px-3 py-2 text-xs shadow-overlay">
      <p className="mb-1 font-medium text-[var(--color-foreground)]">{String(entry.name ?? "")}</p>
      <p className="tabular-nums text-[var(--color-muted-foreground)]">
        {formatNumber(value)}
        {total > 0 && <span className="ml-1.5 text-[var(--color-subtle)]">{share} %</span>}
      </p>
    </div>
  );
}

interface DonutChartProps {
  data: Array<{ name: string; value: number }>;
  height?: number;
  colors?: ChartColor[];
  /** Text in der Mitte, z. B. die Gesamtsumme. */
  centerLabel?: string;
  centerValue?: string | number;
  emptyMessage?: string;
}

/** Ringdiagramm mit Beschriftung in der Mitte und Legende daneben. */
export function DonutChart({
  data,
  height = 240,
  colors = DEFAULT_COLORS,
  centerLabel,
  centerValue,
  emptyMessage,
}: DonutChartProps) {
  const mounted = useMounted();

  if (data.length === 0) return <ChartEmpty height={height} message={emptyMessage} />;
  if (!mounted) return <div style={{ height }} aria-hidden />;

  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((_, index) => (
                <Cell key={index} fill={CHART_COLOR_VARS[colors[index % colors.length]]} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>

        {(centerLabel || centerValue !== undefined) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {centerValue !== undefined && (
              <span className="text-xl font-semibold tabular-nums">
                {typeof centerValue === "number" ? formatNumber(centerValue) : centerValue}
              </span>
            )}
            {centerLabel && <span className="text-xs text-[var(--color-muted-foreground)]">{centerLabel}</span>}
          </div>
        )}
      </div>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((entry, index) => (
          <li key={entry.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: CHART_COLOR_VARS[colors[index % colors.length]] }}
              />
              <span className="truncate text-[var(--color-muted-foreground)]">{entry.name}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {formatNumber(entry.value)}
              {total > 0 && (
                <span className="ml-1.5 text-xs text-[var(--color-subtle)]">
                  {Math.round((entry.value / total) * 100)} %
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

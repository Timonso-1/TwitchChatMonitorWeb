"use client";

import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AxisCaption,
  CHART_COLOR_VARS,
  ChartEmpty,
  ChartLegend,
  ChartTooltip,
  applyAxisFormat,
  useMounted,
  type AxisFormat,
  type ChartColor,
  type SeriesConfig,
  type ValueFormat,
} from "./chart-primitives";
import { formatNumber } from "@/lib/utils";

/** Siehe AreaChart: `object` statt `Record`, damit auch Interfaces passen. */
interface BarChartProps<T extends object> {
  data: T[];
  xKey: string;
  series: SeriesConfig[];
  height?: number;
  /** Balken waagerecht darstellen – gut für Ranglisten mit langen Namen. */
  horizontal?: boolean;
  xFormat?: AxisFormat;
  labelFormat?: AxisFormat;
  valueFormat?: ValueFormat;
  emptyMessage?: string;
  /** Färbt jeden Balken einzeln – nur bei genau einer Serie sinnvoll. */
  colorByIndex?: ChartColor[];
  /** Beschriftung unter dem Diagramm. */
  xLabel?: string;
  /** Breite der Kategorie-Achse bei waagerechten Balken. */
  categoryWidth?: number;
  /**
   * Erzwingt eine Beschriftung unter jedem Balken.
   * Sinnvoll bei festen Kategorien wie Wochentagen oder Stunden,
   * die Recharts sonst automatisch ausdünnt.
   */
  showAllTicks?: boolean;
  /** Dreht die Beschriftungen, wenn sie sonst überlappen. */
  angledTicks?: boolean;
}

export function BarChart<T extends object>({
  data,
  xKey,
  series,
  height = 260,
  horizontal,
  xFormat = "none",
  labelFormat,
  valueFormat,
  emptyMessage,
  colorByIndex,
  xLabel,
  categoryWidth = 120,
  showAllTicks,
  angledTicks,
}: BarChartProps<T>) {
  const mounted = useMounted();

  if (data.length === 0) return <ChartEmpty height={height} message={emptyMessage} />;
  if (!mounted) return <div style={{ height }} aria-hidden />;

  // Gedrehte Beschriftungen brauchen unten mehr Platz.
  const bottomMargin = angledTicks ? 18 : 0;

  return (
    <div>
      <ResponsiveContainer width="100%" height={height + bottomMargin}>
        <RechartsBarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 8, bottom: bottomMargin, left: horizontal ? 8 : -16 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={horizontal} horizontal={!horizontal} />

          {horizontal ? (
            <>
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => formatNumber(v)} />
              <YAxis
                type="category"
                dataKey={xKey}
                tickLine={false}
                axisLine={false}
                width={categoryWidth}
                interval={showAllTicks ? 0 : "preserveStartEnd"}
                tickFormatter={(value) => applyAxisFormat(value, xFormat)}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={xKey}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                // interval 0 erzwingt jede Beschriftung; minTickGap würde sie sonst ausdünnen.
                interval={showAllTicks ? 0 : "preserveStartEnd"}
                minTickGap={showAllTicks ? 0 : 8}
                angle={angledTicks ? -45 : undefined}
                textAnchor={angledTicks ? "end" : "middle"}
                height={angledTicks ? 48 : undefined}
                tickFormatter={(value) => applyAxisFormat(value, xFormat)}
              />
              <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatNumber(v)} />
            </>
          )}

          <Tooltip
            cursor={{ fillOpacity: 0.08 }}
            content={<ChartTooltip labelFormat={labelFormat ?? "none"} valueFormat={valueFormat} />}
          />

          {series.map((entry) => (
            <Bar
              key={entry.key}
              dataKey={entry.key}
              name={entry.label}
              fill={CHART_COLOR_VARS[entry.color]}
              radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              maxBarSize={horizontal ? 22 : 48}
            >
              {colorByIndex &&
                data.map((_, index) => (
                  <Cell key={index} fill={CHART_COLOR_VARS[colorByIndex[index % colorByIndex.length]]} />
                ))}
            </Bar>
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>

      <ChartLegend series={series} always={Boolean(series[0]?.unit)} />
      {xLabel && <AxisCaption>{xLabel}</AxisCaption>}
    </div>
  );
}

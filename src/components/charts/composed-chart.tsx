"use client";

import * as React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart as RechartsComposedChart,
  Line,
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
  type SeriesConfig,
  type ValueFormat,
} from "./chart-primitives";
import { formatCompact } from "@/lib/utils";

/** Siehe AreaChart: `object` statt `Record`, damit auch Interfaces passen. */
interface ComposedChartProps<T extends object> {
  data: T[];
  xKey: string;
  /** Als Fläche dargestellte Serie – meist der kumulierte Verlauf. */
  areaSeries: SeriesConfig;
  /** Als Linie dargestellte Serie – meist der tageweise Zuwachs. */
  lineSeries?: SeriesConfig;
  height?: number;
  xFormat?: AxisFormat;
  labelFormat?: AxisFormat;
  valueFormat?: ValueFormat;
  emptyMessage?: string;
  /**
   * Y-Achse nicht bei null beginnen lassen. Sinnvoll für kumulierte Werte,
   * bei denen sonst die gesamte Kurve flach wirkt.
   */
  areaAxisFromMin?: boolean;
  /** Beschriftung unter der X-Achse. */
  xLabel?: string;
}

/**
 * Kombiniert Fläche und Linie mit getrennten Y-Achsen –
 * z. B. Gesamtbestand gegen täglichen Zuwachs.
 */
export function ComposedChart<T extends object>({
  data,
  xKey,
  areaSeries,
  lineSeries,
  height = 300,
  xFormat = "none",
  labelFormat,
  valueFormat,
  emptyMessage,
  areaAxisFromMin = true,
  xLabel,
}: ComposedChartProps<T>) {
  const mounted = useMounted();
  const gradientId = React.useId();

  const areaDomain = React.useMemo<[number | "auto", number | "auto"]>(() => {
    if (!areaAxisFromMin || data.length === 0) return [0, "auto"];

    // Der Schlüssel kommt als String herein – deshalb hier ein gezielter Cast.
    const values = data
      .map((row) => Number((row as Record<string, unknown>)[areaSeries.key]))
      .filter((value) => Number.isFinite(value));

    if (values.length === 0) return [0, "auto"];

    const min = Math.min(...values);
    const max = Math.max(...values);
    // Etwas Luft nach unten, damit die Kurve nicht am Rand klebt.
    const padding = Math.max(1, Math.round((max - min) * 0.15));

    return [Math.max(0, min - padding), "auto"];
  }, [data, areaSeries.key, areaAxisFromMin]);

  if (data.length === 0) return <ChartEmpty height={height} message={emptyMessage} />;
  if (!mounted) return <div style={{ height }} aria-hidden />;

  const legend = lineSeries ? [areaSeries, lineSeries] : [areaSeries];

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsComposedChart data={data} margin={{ top: 8, right: lineSeries ? 8 : 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLOR_VARS[areaSeries.color]} stopOpacity={0.3} />
              <stop offset="100%" stopColor={CHART_COLOR_VARS[areaSeries.color]} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={28}
            tickFormatter={(value) => applyAxisFormat(value, xFormat)}
          />

          <YAxis
            yAxisId="area"
            tickLine={false}
            axisLine={false}
            width={56}
            domain={areaDomain}
            tickFormatter={(value) => formatCompact(value)}
            label={{
              value: areaSeries.unit ?? areaSeries.label,
              angle: -90,
              position: "insideLeft",
              offset: 14,
              style: { fill: "var(--color-subtle)", fontSize: 11, textAnchor: "middle" },
            }}
          />

          {lineSeries && (
            <YAxis
              yAxisId="line"
              orientation="right"
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(value) => formatCompact(value)}
              label={{
                value: lineSeries.unit ?? lineSeries.label,
                angle: 90,
                position: "insideRight",
                offset: 14,
                style: { fill: "var(--color-subtle)", fontSize: 11, textAnchor: "middle" },
              }}
            />
          )}

          <Tooltip content={<ChartTooltip labelFormat={labelFormat ?? xFormat} valueFormat={valueFormat} />} />

          <Area
            yAxisId="area"
            type="monotone"
            dataKey={areaSeries.key}
            name={areaSeries.label}
            stroke={CHART_COLOR_VARS[areaSeries.color]}
            strokeWidth={2}
            fill={`url(#${gradientId}-area)`}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />

          {lineSeries && (
            <Line
              yAxisId="line"
              type="monotone"
              dataKey={lineSeries.key}
              name={lineSeries.label}
              stroke={CHART_COLOR_VARS[lineSeries.color]}
              strokeWidth={1.5}
              strokeOpacity={0.75}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          )}
        </RechartsComposedChart>
      </ResponsiveContainer>

      <ChartLegend series={legend} always />
      {xLabel && <AxisCaption>{xLabel}</AxisCaption>}
    </div>
  );
}

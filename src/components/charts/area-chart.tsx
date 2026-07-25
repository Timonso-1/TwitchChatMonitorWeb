"use client";

import * as React from "react";
import {
  Area,
  AreaChart as RechartsAreaChart,
  CartesianGrid,
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
import { formatNumber } from "@/lib/utils";

interface AreaChartProps<T extends Record<string, unknown>> {
  data: T[];
  /** Feld fuer die X-Achse. */
  xKey: string;
  series: SeriesConfig[];
  height?: number;
  /** Benanntes Format – Funktionen sind hier nicht moeglich (Server → Client). */
  xFormat?: AxisFormat;
  labelFormat?: AxisFormat;
  valueFormat?: ValueFormat;
  emptyMessage?: string;
  hideYAxis?: boolean;
  /** Beschriftung unter der X-Achse, z. B. "Datum". */
  xLabel?: string;
  /** Beschriftung an der Y-Achse, z. B. "Nachrichten". */
  yLabel?: string;
}

/** Flaechendiagramm mit weichem Farbverlauf – fuer Zeitreihen. */
export function AreaChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 260,
  xFormat = "none",
  labelFormat,
  valueFormat,
  emptyMessage,
  hideYAxis,
  xLabel,
  yLabel,
}: AreaChartProps<T>) {
  const mounted = useMounted();
  const gradientId = React.useId();

  if (data.length === 0) return <ChartEmpty height={height} message={emptyMessage} />;
  if (!mounted) return <div style={{ height }} aria-hidden />;

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsAreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: hideYAxis ? 0 : -16 }}>
          <defs>
            {series.map((entry) => (
              <linearGradient key={entry.key} id={`${gradientId}-${entry.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLOR_VARS[entry.color]} stopOpacity={0.28} />
                <stop offset="100%" stopColor={CHART_COLOR_VARS[entry.color]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={(value) => applyAxisFormat(value, xFormat)}
          />

          {!hideYAxis && (
            <YAxis
              tickLine={false}
              axisLine={false}
              width={yLabel ? 68 : 56}
              tickFormatter={(value) => formatNumber(value)}
              label={
                yLabel
                  ? {
                      value: yLabel,
                      angle: -90,
                      position: "insideLeft",
                      offset: 12,
                      style: { fill: "var(--color-subtle)", fontSize: 11, textAnchor: "middle" },
                    }
                  : undefined
              }
            />
          )}

          <Tooltip content={<ChartTooltip labelFormat={labelFormat ?? xFormat} valueFormat={valueFormat} />} />

          {series.map((entry) => (
            <Area
              key={entry.key}
              type="monotone"
              dataKey={entry.key}
              name={entry.label}
              stroke={CHART_COLOR_VARS[entry.color]}
              strokeWidth={2}
              fill={`url(#${gradientId}-${entry.key})`}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          ))}
        </RechartsAreaChart>
      </ResponsiveContainer>

      <ChartLegend series={series} always={Boolean(series[0]?.unit)} />
      {xLabel && <AxisCaption>{xLabel}</AxisCaption>}
    </div>
  );
}

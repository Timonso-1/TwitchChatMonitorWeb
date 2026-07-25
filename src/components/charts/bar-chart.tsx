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

interface BarChartProps<T extends Record<string, unknown>> {
  data: T[];
  xKey: string;
  series: SeriesConfig[];
  height?: number;
  /** Balken waagerecht darstellen – gut fuer Ranglisten mit langen Namen. */
  horizontal?: boolean;
  xFormat?: AxisFormat;
  labelFormat?: AxisFormat;
  valueFormat?: ValueFormat;
  emptyMessage?: string;
  /** Faerbt jeden Balken einzeln – nur bei genau einer Serie sinnvoll. */
  colorByIndex?: ChartColor[];
}

export function BarChart<T extends Record<string, unknown>>({
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
}: BarChartProps<T>) {
  const mounted = useMounted();

  if (data.length === 0) return <ChartEmpty height={height} message={emptyMessage} />;
  if (!mounted) return <div style={{ height }} aria-hidden />;

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 8, bottom: 0, left: horizontal ? 8 : -16 }}
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
                width={110}
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
                minTickGap={8}
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

      <ChartLegend series={series} />
    </div>
  );
}

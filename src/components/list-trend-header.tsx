import type { LucideIcon } from "lucide-react";
import { ChartCard } from "@/components/chart-card";
import { AreaChart } from "@/components/charts";
import { RangeSelector } from "@/components/range-selector";
import { StatCard } from "@/components/stat-card";
import type { TrendPoint } from "@/lib/queries/trends";
import { rangeSentence, type RangePreset, type ResolvedRange } from "@/lib/range";
import { percentChange } from "@/lib/utils";

interface ListTrendHeaderProps {
  /** Basispfad der Seite, z. B. "/messages". */
  basePath: string;
  /** Aktive Filter, die beim Zeitraumwechsel erhalten bleiben. */
  params: Record<string, string | number | undefined | null>;
  presets: readonly RangePreset[];
  range: ResolvedRange;

  title: string;
  description: string;
  points: TrendPoint[];
  seriesLabel: string;
  seriesColor: "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5";

  /** Kennzahlen rechts neben dem Diagramm. */
  currentValue: number;
  previousValue: number;
  totalValue: number;
  /** false, wenn die Vorperiode vor dem ersten Datensatz liegt. */
  comparable?: boolean;
  currentLabel: string;
  totalLabel: string;
  icon: LucideIcon;
  totalIcon: LucideIcon;
  accent?: "brand" | "success" | "warning" | "destructive" | "info" | "neutral";
}

/**
 * Wiederverwendbarer Lead der Listenseiten:
 * Verlaufsdiagramm mit Zeitraumwahl links, zwei Kennzahlen rechts.
 */
export function ListTrendHeader({
  basePath,
  params,
  presets,
  range,
  title,
  description,
  points,
  seriesLabel,
  seriesColor,
  currentValue,
  previousValue,
  totalValue,
  comparable = true,
  currentLabel,
  totalLabel,
  icon: Icon,
  totalIcon: TotalIcon,
  accent = "brand",
}: ListTrendHeaderProps) {
  // Ohne vollständige Vorperiode wäre jeder Prozentwert irreführend.
  const trend = comparable ? percentChange(currentValue, previousValue) : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <ChartCard
        title={title}
        description={`${description} in ${rangeSentence(range)}.`}
        actions={<RangeSelector basePath={basePath} params={params} presets={presets} range={range} />}
      >
        <AreaChart
          data={points}
          xKey="bucket"
          series={[{ key: "value", label: seriesLabel, color: seriesColor }]}
          height={240}
          xFormat={range.hourly ? "time" : "date"}
          labelFormat={range.hourly ? "datetime" : "weekday-long"}
          xLabel={range.hourly ? "Uhrzeit" : "Datum"}
          yLabel={seriesLabel}
          emptyMessage={`Keine Einträge in ${rangeSentence(range)}.`}
        />
      </ChartCard>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <StatCard
          label={currentLabel}
          value={currentValue}
          hint={trend === null && comparable ? "Zu wenig Vergleichsdaten für einen Trend" : undefined}
          icon={Icon}
          accent={accent}
          size="large"
          trend={trend}
          trendLabel="Vergleich mit dem gleich langen Zeitraum davor"
        />
        <StatCard label={totalLabel} value={totalValue} icon={TotalIcon} size="large" />
      </div>
    </div>
  );
}

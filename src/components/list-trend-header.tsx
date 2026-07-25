import type { LucideIcon } from "lucide-react";
import { ChartCard } from "@/components/chart-card";
import { AreaChart } from "@/components/charts";
import { RangeSelector } from "@/components/range-selector";
import { StatCard } from "@/components/stat-card";
import type { DailyPoint } from "@/lib/queries/trends";
import { percentChange } from "@/lib/utils";

interface ListTrendHeaderProps {
  /** Basispfad der Seite, z. B. "/messages". */
  basePath: string;
  /** Aktive Filter, die beim Zeitraumwechsel erhalten bleiben. */
  params: Record<string, string | number | undefined | null>;
  rangeOptions: ReadonlyArray<{ value: number; label: string }>;
  range: number;
  rangeLabel: string;

  title: string;
  description: string;
  points: DailyPoint[];
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
 * Wiederverwendbarer Kopfbereich der Listenseiten:
 * Verlaufsdiagramm mit Zeitraumwahl links, zwei Kennzahlen rechts.
 */
export function ListTrendHeader({
  basePath,
  params,
  rangeOptions,
  range,
  rangeLabel,
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
  // Ohne vollstaendige Vorperiode waere jeder Prozentwert irrefuehrend.
  const trend = comparable ? percentChange(currentValue, previousValue) : null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <ChartCard
        title={title}
        description={`${description} · ${rangeLabel}`}
        actions={
          <RangeSelector basePath={basePath} params={params} options={rangeOptions} current={range} />
        }
      >
        <AreaChart
          data={points}
          xKey="bucket"
          series={[{ key: "value", label: seriesLabel, color: seriesColor }]}
          height={200}
          xFormat="date"
          labelFormat="weekday-long"
          xLabel="Datum"
          yLabel={seriesLabel}
          emptyMessage={`Keine Einträge in den letzten ${rangeLabel.toLowerCase()}.`}
        />
      </ChartCard>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <StatCard
          label={currentLabel}
          value={currentValue}
          hint={trend === null && comparable ? "Zu wenig Vergleichsdaten für einen Trend" : undefined}
          icon={Icon}
          accent={accent}
          size="large"
          trend={trend}
          trendLabel={`Vergleich mit den vorherigen ${rangeLabel.toLowerCase()}`}
        />
        <StatCard label={totalLabel} value={totalValue} icon={TotalIcon} size="large" />
      </div>
    </div>
  );
}

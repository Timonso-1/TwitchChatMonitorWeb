import { MessageSquare, ShieldAlert, Users, Zap } from "lucide-react";
import { PanelSurface } from "@/components/panel-surface";
import { SectionHeader } from "@/components/section-header";
import { StatCard } from "@/components/stat-card";
import { AreaChart } from "@/components/charts";
import { getCachedDashboardLead } from "@/lib/queries/dashboard";
import { rangeSentence, type ResolvedRange } from "@/lib/range";
import { formatNumber, percentChange } from "@/lib/utils";

interface DashboardLeadProps {
  range: ResolvedRange;
  canSeeMessages: boolean;
  canSeeEvents: boolean;
  canSeeModeration: boolean;
}

export async function DashboardLead({
  range,
  canSeeMessages,
  canSeeEvents,
  canSeeModeration,
}: DashboardLeadProps) {
  const { stats, timeline } = await getCachedDashboardLead(range);
  const rangePhrase = rangeSentence(range);
  const trendOrNull = (current: number, previous: number) =>
    stats.comparable ? percentChange(current, previous) : null;

  const timelineSeries = [
    ...(canSeeMessages ? [{ key: "messages", label: "Nachrichten", color: "chart-1" as const }] : []),
    ...(canSeeEvents ? [{ key: "events", label: "Events", color: "chart-2" as const }] : []),
    ...(canSeeModeration ? [{ key: "moderation", label: "Moderation", color: "chart-4" as const }] : []),
  ];

  return (
    <>
      {timelineSeries.length > 0 && (
        <section className="space-y-4">
          <SectionHeader
            title="Aktivitätsverlauf"
            description={`${range.hourly ? "Stündlich" : "Täglich"} aggregiert in ${rangePhrase}.`}
          />
          <PanelSurface>
            <AreaChart
              data={timeline}
              xKey="bucket"
              series={timelineSeries}
              height={320}
              xFormat={range.hourly ? "time" : "date"}
              labelFormat={range.hourly ? "datetime" : "weekday-long"}
              xLabel={range.hourly ? "Uhrzeit" : "Datum"}
              yLabel="Anzahl"
            />
          </PanelSurface>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Nachrichten"
          value={stats.messagesRange}
          hint={`${formatNumber(stats.messagesTotal)} insgesamt`}
          icon={MessageSquare}
          size="large"
          trend={trendOrNull(stats.messagesRange, stats.messagesPrevious)}
          trendLabel="Vergleich mit dem gleich langen Zeitraum davor"
        />
        <StatCard
          label="Aktive Chatter"
          value={stats.uniqueChattersRange}
          hint={`${formatNumber(stats.viewersTotal)} bekannt`}
          icon={Users}
          accent="brand"
          size="large"
          trend={trendOrNull(stats.uniqueChattersRange, stats.uniqueChattersPrevious)}
          trendLabel="Vergleich mit dem gleich langen Zeitraum davor"
        />
        <StatCard
          label="Events"
          value={stats.eventsRange}
          hint={stats.bitsRange > 0 ? `${formatNumber(stats.bitsRange)} Bits` : undefined}
          icon={Zap}
          accent="success"
          size="large"
          trend={trendOrNull(stats.eventsRange, stats.eventsPrevious)}
          trendLabel="Vergleich mit dem gleich langen Zeitraum davor"
        />
        <StatCard
          label="Moderation"
          value={stats.moderationRange}
          hint={`${formatNumber(stats.channelsActive)} von ${formatNumber(stats.channelsTotal)} Channels aktiv`}
          icon={ShieldAlert}
          accent={stats.moderationRange > 0 ? "warning" : "neutral"}
          size="large"
          trend={trendOrNull(stats.moderationRange, stats.moderationPrevious)}
          trendLabel="Vergleich mit dem gleich langen Zeitraum davor"
        />
      </div>
    </>
  );
}

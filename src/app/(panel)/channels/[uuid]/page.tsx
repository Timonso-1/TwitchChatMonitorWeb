import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquare, Radar, ShieldAlert, Users, Zap } from "lucide-react";
import { AreaChart, DonutChart } from "@/components/charts";
import { ChartCard } from "@/components/chart-card";
import { DistributionChart } from "@/components/distribution-chart";
import { PageHeader } from "@/components/page-header";
import { PanelSurface } from "@/components/panel-surface";
import { RangeSelector } from "@/components/range-selector";
import { RankingList } from "@/components/ranking-list";
import { SectionHeader } from "@/components/section-header";
import { StatCard } from "@/components/stat-card";
import { ViewerAvatar } from "@/components/viewer-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardField } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  getChannelActivity,
  getChannelDetail,
  getChannelEventBreakdown,
  getChannelHourDistribution,
  getChannelModerationBreakdown,
  getChannelTopChatters,
} from "@/lib/queries/channels";
import { TREND_PRESETS, rangeSentence, resolveRange } from "@/lib/range";
import { eventTypeLabel, moderationActionLabel } from "@/lib/twitch";
import { getCachedViewerAvatars } from "@/lib/twitch-api";
import { formatDateTime, formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ uuid: string }>;
}): Promise<Metadata> {
  const { uuid } = await params;
  const channel = await getChannelDetail(uuid);
  return { title: channel ? channel.name : "Channel" };
}

export default async function ChannelDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.CHANNELS_VIEW);
  const [{ uuid }, query] = await Promise.all([params, searchParams]);

  const range = resolveRange(query, { presets: TREND_PRESETS, fallbackDays: 30 });

  const channel = await getChannelDetail(uuid);
  if (!channel) notFound();

  const permissions = session.user.permissions;
  const canSeeMessages = hasPermission(permissions, PERMISSIONS.MESSAGES_VIEW);
  const canSeeEvents = hasPermission(permissions, PERMISSIONS.EVENTS_VIEW);
  const canSeeModeration = hasPermission(permissions, PERMISSIONS.MODERATION_VIEW);
  const canSeeViewers = hasPermission(permissions, PERMISSIONS.VIEWERS_VIEW);

  const [activity, topChatters, eventBreakdown, moderationBreakdown, hourDistribution] = await Promise.all([
    getChannelActivity(uuid, range),
    canSeeViewers ? getChannelTopChatters(uuid, range) : Promise.resolve([]),
    canSeeEvents ? getChannelEventBreakdown(uuid, range) : Promise.resolve([]),
    canSeeModeration ? getChannelModerationBreakdown(uuid, range) : Promise.resolve([]),
    canSeeMessages ? getChannelHourDistribution(uuid) : Promise.resolve([]),
  ]);

  const avatars = await getCachedViewerAvatars(topChatters.map((chatter) => chatter.userId));
  const rangePhrase = rangeSentence(range);

  const timelineSeries = [
    ...(canSeeMessages ? [{ key: "messages", label: "Nachrichten", color: "chart-1" as const }] : []),
    ...(canSeeEvents ? [{ key: "events", label: "Events", color: "chart-2" as const }] : []),
    ...(canSeeModeration ? [{ key: "moderation", label: "Moderation", color: "chart-4" as const }] : []),
  ];

  return (
    <>
      <PageHeader
        title={channel.name}
        description={`Broadcaster-ID ${channel.broadcasterId}`}
        backHref="/channels"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={channel.active ? "success" : "muted"}>{channel.active ? "Aktiv" : "Inaktiv"}</Badge>
            <RangeSelector basePath={`/channels/${uuid}`} presets={TREND_PRESETS} range={range} />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Nachrichten gesamt" value={channel.messageCount} icon={MessageSquare} size="large" />
        <StatCard
          label="Verschiedene Chatter"
          value={channel.uniqueChatters}
          icon={Users}
          accent="brand"
          size="large"
        />
        <StatCard label="Events gesamt" value={channel.eventCount} icon={Zap} accent="success" size="large" />
        <StatCard
          label="Moderationsaktionen"
          value={channel.moderationCount}
          icon={ShieldAlert}
          accent={channel.moderationCount > 0 ? "warning" : "neutral"}
          size="large"
        />
      </div>

      {timelineSeries.length > 0 && (
        <ChartCard
          title="Aktivitätsverlauf"
          description={`Tägliche Werte in ${rangePhrase}.`}
        >
          <AreaChart
            data={activity}
            xKey="bucket"
            series={timelineSeries}
            height={280}
            xFormat="date"
            labelFormat="weekday-long"
            xLabel="Datum"
            yLabel="Anzahl"
            emptyMessage="Keine Aktivität im gewählten Zeitraum."
          />
        </ChartCard>
      )}

      <div className="grid gap-8 xl:grid-cols-2">
        {canSeeViewers && (
          <section className="space-y-4">
            <SectionHeader
              title="Aktivste Chatter"
              description={`Nachrichten je Chatter in ${rangePhrase}.`}
            />
            <RankingList
              entries={topChatters.map((chatter) => {
                const name = chatter.displayName ?? chatter.userName;

                return {
                  id: chatter.userId,
                  label: name,
                  value: chatter.messages,
                  href: `/viewers/${chatter.userId}`,
                  leading: (
                    <ViewerAvatar
                      name={name}
                      imageUrl={avatars.get(chatter.userId)?.profileImageUrl}
                      size="sm"
                    />
                  ),
                };
              })}
              unit="Nachrichten"
              accent="brand"
              emptyMessage="Keine Chat-Aktivität im Zeitraum."
            />
          </section>
        )}

        {canSeeEvents && (
          <section className="space-y-4">
            <SectionHeader
              title="Event-Verteilung"
              description={`Anteile der Event-Typen in ${rangePhrase}.`}
            />
            <PanelSurface>
              <DonutChart
                data={eventBreakdown.map((entry) => ({ name: eventTypeLabel(entry.name), value: entry.value }))}
                centerValue={eventBreakdown.reduce((sum, entry) => sum + entry.value, 0)}
                centerLabel="Events"
                emptyMessage="Keine Events im Zeitraum."
              />
            </PanelSurface>
          </section>
        )}
      </div>

      <div className="grid gap-8 xl:grid-cols-3">
        {canSeeMessages && (
          <section className="space-y-4 xl:col-span-2">
            <SectionHeader
              title="Aktivität nach Uhrzeit"
              description="Wann in diesem Channel geschrieben wird — gesamter Zeitraum."
            />
            <PanelSurface>
              <DistributionChart
                bars={hourDistribution.map((entry) => ({
                  label: String(entry.hour).padStart(2, "0"),
                  fullLabel: `${String(entry.hour).padStart(2, "0")}:00 – ${String(entry.hour).padStart(2, "0")}:59 Uhr`,
                  value: entry.messages,
                }))}
                height={160}
                accent="info"
                labelEvery={3}
              />
              <p className="pt-2 text-xs text-[var(--color-subtle)]">Stunde des Tages (Europe/Berlin)</p>
            </PanelSurface>
          </section>
        )}

        {canSeeModeration && (
          <section className="space-y-4">
            <SectionHeader title="Moderationsarten" description={`Aufschlüsselung in ${rangePhrase}.`} />
            <RankingList
              entries={moderationBreakdown.map((entry) => ({
                id: entry.name,
                label: moderationActionLabel(entry.name),
                value: entry.value,
              }))}
              unit="Aktionen"
              accent="warning"
              showRank={false}
              emptyMessage="Keine Moderationsaktionen im Zeitraum."
            />
          </section>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-4">
          <SectionHeader title="Stammdaten" description="Technische Kennungen und Zeitstempel." />
          <PanelSurface>
            <div className="grid gap-4 sm:grid-cols-2">
              <CardField label="UUID">
                <span className="font-mono text-xs">{channel.uuid}</span>
              </CardField>
              <CardField label="Broadcaster-ID">
                <span className="font-mono text-xs">{channel.broadcasterId}</span>
              </CardField>
              <CardField label="Angelegt">{formatDateTime(channel.createdAt)}</CardField>
              <CardField label="Zuletzt geändert">{formatDateTime(channel.updatedAt)}</CardField>
              <CardField label="Angelegt von">{channel.createdByName ?? "—"}</CardField>
              <CardField label="Letzte Nachricht">
                {channel.lastMessageAt ? formatRelative(channel.lastMessageAt) : "—"}
              </CardField>
            </div>
          </PanelSurface>
        </section>

        <section className="space-y-4">
          <SectionHeader
            title="Weiterführende Ansichten"
            description="Filter sind bereits auf diesen Channel gesetzt."
          />
          <PanelSurface>
            <div className="flex flex-wrap gap-2">
              {hasPermission(permissions, PERMISSIONS.CHAT_LIVE) && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/live?channel=${channel.uuid}`}>
                    <Radar />
                    Live-Chat
                  </Link>
                </Button>
              )}
              {canSeeMessages && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/messages?channel=${channel.uuid}`}>
                    <MessageSquare />
                    Nachrichten
                  </Link>
                </Button>
              )}
              {canSeeEvents && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/events?channel=${channel.uuid}`}>
                    <Zap />
                    Events
                  </Link>
                </Button>
              )}
              {canSeeModeration && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/moderation?channel=${channel.uuid}`}>
                    <ShieldAlert />
                    Moderation
                  </Link>
                </Button>
              )}
            </div>
          </PanelSurface>
        </section>
      </div>
    </>
  );
}

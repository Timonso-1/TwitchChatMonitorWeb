import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquare, Radar, ShieldAlert, Users, Zap } from "lucide-react";
import { AreaChart, DonutChart } from "@/components/charts";
import { ChartCard } from "@/components/chart-card";
import { DistributionChart } from "@/components/distribution-chart";
import { PageHeader } from "@/components/page-header";
import { RangeSelector } from "@/components/range-selector";
import { RankingList } from "@/components/ranking-list";
import { StatCard } from "@/components/stat-card";
import { ViewerAvatar } from "@/components/viewer-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardField, CardHeader, CardTitle } from "@/components/ui/card";
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
import { eventTypeLabel, moderationActionLabel } from "@/lib/twitch";
import { getCachedViewerAvatars } from "@/lib/twitch-api";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RANGE_OPTIONS = [
  { value: 7, label: "7 Tage" },
  { value: 30, label: "30 Tage" },
  { value: 90, label: "90 Tage" },
];

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

  const rangeParam = Number(Array.isArray(query.range) ? query.range[0] : query.range);
  const range = RANGE_OPTIONS.find((option) => option.value === rangeParam)?.value ?? 30;

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

  const rangeLabel = RANGE_OPTIONS.find((option) => option.value === range)?.label ?? `${range} Tage`;

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
            <RangeSelector basePath={`/channels/${uuid}`} options={RANGE_OPTIONS} current={range} />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Nachrichten gesamt" value={channel.messageCount} icon={MessageSquare} />
        <StatCard label="Verschiedene Chatter" value={channel.uniqueChatters} icon={Users} accent="brand" />
        <StatCard label="Events gesamt" value={channel.eventCount} icon={Zap} accent="success" />
        <StatCard
          label="Moderationsaktionen"
          value={channel.moderationCount}
          icon={ShieldAlert}
          accent={channel.moderationCount > 0 ? "warning" : "neutral"}
        />
      </div>

      {timelineSeries.length > 0 && (
        <ChartCard
          title="Aktivitätsverlauf"
          description={`Tägliche Werte der letzten ${rangeLabel.toLowerCase()}`}
        >
          <AreaChart
            data={activity}
            xKey="bucket"
            series={timelineSeries}
            height={260}
            xFormat="date"
            labelFormat="weekday-long"
            xLabel="Datum"
            yLabel="Anzahl"
            emptyMessage="Keine Aktivität im gewählten Zeitraum."
          />
        </ChartCard>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {canSeeViewers && (
          <Card>
            <CardHeader>
              <CardTitle>Aktivste Chatter</CardTitle>
              <CardDescription>Nachrichten je Chatter in den letzten {rangeLabel.toLowerCase()}.</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        )}

        {canSeeEvents && (
          <Card>
            <CardHeader>
              <CardTitle>Event-Verteilung</CardTitle>
              <CardDescription>Anteile der Event-Typen im gewählten Zeitraum.</CardDescription>
            </CardHeader>
            <CardContent>
              <DonutChart
                data={eventBreakdown.map((entry) => ({ name: eventTypeLabel(entry.name), value: entry.value }))}
                centerValue={eventBreakdown.reduce((sum, entry) => sum + entry.value, 0)}
                centerLabel="Events"
                emptyMessage="Keine Events im Zeitraum."
              />
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {canSeeMessages && (
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Aktivität nach Uhrzeit</CardTitle>
              <CardDescription>Wann in diesem Channel geschrieben wird — gesamter Zeitraum.</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        )}

        {canSeeModeration && (
          <Card>
            <CardHeader>
              <CardTitle>Moderationsarten</CardTitle>
              <CardDescription>Im gewählten Zeitraum.</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stammdaten</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weiterführende Ansichten</CardTitle>
            <CardDescription>Alle Filter sind bereits auf diesen Channel gesetzt.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
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
          </CardContent>
        </Card>
      </div>
    </>
  );
}

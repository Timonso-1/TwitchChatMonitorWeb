import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquare, ShieldAlert, Users, Zap } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { RangeSelector } from "@/components/range-selector";
import { AreaChart, DonutChart } from "@/components/charts";
import { RankingList } from "@/components/ranking-list";
import { EventBadge, ModerationBadge, SubTierBadge } from "@/components/twitch-badges";
import { ViewerAvatar } from "@/components/viewer-avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  RANGE_OPTIONS,
  getActivityTimeline,
  getDashboardStats,
  getEventDistribution,
  getRecentEvents,
  getRecentModeration,
  getTopChannels,
  getTopChatters,
  normalizeRange,
} from "@/lib/queries/dashboard";
import { eventDetailText, eventTypeLabel, formatDuration } from "@/lib/twitch";
import { getViewerAvatars } from "@/lib/twitch-api";
import { formatNumber, formatRelative } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.DASHBOARD_VIEW);
  const params = await searchParams;
  const range = normalizeRange(params.range);

  const permissions = session.user.permissions;
  const canSeeMessages = hasPermission(permissions, PERMISSIONS.MESSAGES_VIEW);
  const canSeeEvents = hasPermission(permissions, PERMISSIONS.EVENTS_VIEW);
  const canSeeModeration = hasPermission(permissions, PERMISSIONS.MODERATION_VIEW);
  const canSeeChannels = hasPermission(permissions, PERMISSIONS.CHANNELS_VIEW);
  const canSeeViewers = hasPermission(permissions, PERMISSIONS.VIEWERS_VIEW);

  const [stats, timeline, topChannels, eventDistribution, topChatters, recentEvents, recentModeration] =
    await Promise.all([
      getDashboardStats(range),
      getActivityTimeline(range),
      canSeeChannels ? getTopChannels(range) : Promise.resolve([]),
      canSeeEvents ? getEventDistribution(range) : Promise.resolve([]),
      canSeeViewers ? getTopChatters(range) : Promise.resolve([]),
      canSeeEvents ? getRecentEvents(6) : Promise.resolve([]),
      canSeeModeration ? getRecentModeration(6) : Promise.resolve([]),
    ]);

  const chatterAvatars = await getViewerAvatars(topChatters.map((chatter) => chatter.userId));

  const hourly = range <= 1;

  const timelineSeries = [
    ...(canSeeMessages ? [{ key: "messages", label: "Nachrichten", color: "chart-1" as const }] : []),
    ...(canSeeEvents ? [{ key: "events", label: "Events", color: "chart-2" as const }] : []),
    ...(canSeeModeration ? [{ key: "moderation", label: "Moderation", color: "chart-4" as const }] : []),
  ];

  const rangeLabel = RANGE_OPTIONS.find((option) => option.value === range)?.label ?? `${range} Tage`;

  return (
    <>
      <PageHeader
        title={`Willkommen zurück, ${session.user.displayName ?? session.user.username}`}
        description={`Aktivität der letzten ${rangeLabel.toLowerCase()}.`}
        actions={<RangeSelector basePath="/dashboard" options={RANGE_OPTIONS} current={range} />}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Nachrichten (${rangeLabel})`}
          value={stats.messagesRange}
          hint={`${formatNumber(stats.messagesTotal)} insgesamt`}
          icon={MessageSquare}
        />
        <StatCard
          label={`Aktive Chatter (${rangeLabel})`}
          value={stats.uniqueChattersRange}
          hint={`${formatNumber(stats.viewersTotal)} bekannt`}
          icon={Users}
          accent="brand"
        />
        <StatCard
          label={`Events (${rangeLabel})`}
          value={stats.eventsRange}
          hint={stats.bitsRange > 0 ? `${formatNumber(stats.bitsRange)} Bits` : undefined}
          icon={Zap}
          accent="success"
        />
        <StatCard
          label={`Moderation (${rangeLabel})`}
          value={stats.moderationRange}
          hint={`${formatNumber(stats.channelsActive)} von ${formatNumber(stats.channelsTotal)} Channels aktiv`}
          icon={ShieldAlert}
          accent={stats.moderationRange > 0 ? "warning" : "neutral"}
        />
      </div>

      {timelineSeries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Aktivitätsverlauf</CardTitle>
            <CardDescription>
              {hourly ? "Stündlich" : "Täglich"} aggregiert über die letzten {rangeLabel.toLowerCase()}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AreaChart
              data={timeline}
              xKey="bucket"
              series={timelineSeries}
              height={280}
              xFormat={hourly ? "time" : "date"}
              labelFormat={hourly ? "datetime" : "weekday-long"}
              xLabel={hourly ? "Uhrzeit" : "Datum"}
              yLabel="Anzahl"
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {canSeeChannels && (
          <Card>
            <CardHeader>
              <CardTitle>Aktivste Channels</CardTitle>
              <CardDescription>Nachrichten je Channel in den letzten {rangeLabel.toLowerCase()}.</CardDescription>
            </CardHeader>
            <CardContent>
              <RankingList
                entries={topChannels.map((channel) => ({
                  id: channel.uuid,
                  label: channel.name,
                  value: channel.messages,
                  href: `/channels/${channel.uuid}`,
                  badge: channel.active ? undefined : <Badge variant="muted">Inaktiv</Badge>,
                }))}
                unit="Nachrichten"
                accent="brand"
                emptyMessage="Keine Channel-Aktivität im Zeitraum."
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
                data={eventDistribution.map((entry) => ({
                  name: eventTypeLabel(entry.name),
                  value: entry.value,
                }))}
                centerValue={stats.eventsRange}
                centerLabel="Events"
                emptyMessage="Keine Events im Zeitraum."
              />
            </CardContent>
          </Card>
        )}
      </div>

      {canSeeViewers && topChatters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Aktivste Chatter</CardTitle>
            <CardDescription>
              Die gesprächigsten Zuschauer in den letzten {rangeLabel.toLowerCase()}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RankingList
              entries={topChatters.map((chatter) => {
                const name = chatter.displayName ?? chatter.userName;

                return {
                  id: chatter.userId,
                  label: name,
                  sublabel: chatter.displayName && chatter.displayName !== chatter.userName
                    ? `@${chatter.userName}`
                    : undefined,
                  value: chatter.messages,
                  href: `/viewers/${chatter.userId}`,
                  leading: (
                    <ViewerAvatar
                      name={name}
                      imageUrl={chatterAvatars.get(chatter.userId)?.profileImageUrl}
                      size="sm"
                    />
                  ),
                };
              })}
              unit="Nachrichten"
              accent="success"
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {canSeeEvents && (
          <Card>
            <CardHeader>
              <CardTitle>Letzte Events</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Typ</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Nutzer</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Zeit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentEvents.length === 0 ? (
                    <TableEmpty colSpan={5}>Keine Events vorhanden.</TableEmpty>
                  ) : (
                    recentEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          <EventBadge type={event.eventType} />
                        </TableCell>
                        <TableCell className="max-w-24 truncate text-xs text-[var(--color-muted-foreground)]">
                          {event.channelName}
                        </TableCell>
                        <TableCell className="max-w-28 truncate">{event.userName ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <SubTierBadge tier={event.subTier} />
                            <span className="text-[var(--color-muted-foreground)]">
                              {eventDetailText({
                                months: event.months,
                                giftCount: event.giftCount,
                                viewerCount: event.viewerCount,
                                giftedByName: event.giftedByName,
                              })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-xs text-[var(--color-muted-foreground)]">
                          {formatRelative(event.occurredAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {canSeeModeration && (
          <Card>
            <CardHeader>
              <CardTitle>Letzte Moderationsaktionen</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Aktion</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Ziel</TableHead>
                    <TableHead>Dauer</TableHead>
                    <TableHead className="text-right">Zeit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentModeration.length === 0 ? (
                    <TableEmpty colSpan={5}>Keine Moderationsaktionen.</TableEmpty>
                  ) : (
                    recentModeration.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <ModerationBadge action={entry.action} />
                        </TableCell>
                        <TableCell className="max-w-24 truncate text-xs text-[var(--color-muted-foreground)]">
                          {entry.channelName}
                        </TableCell>
                        <TableCell className="max-w-28 truncate">
                          {entry.targetUserId && canSeeViewers ? (
                            <Link href={`/viewers/${entry.targetUserId}`} className="hover:underline">
                              {entry.targetUserName ?? entry.targetUserId}
                            </Link>
                          ) : (
                            (entry.targetUserName ?? "—")
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDuration(entry.durationSeconds)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-xs text-[var(--color-muted-foreground)]">
                          {formatRelative(entry.occurredAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {!canSeeChannels && !canSeeEvents && !canSeeModeration && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
            Für weitere Auswertungen fehlen dir die Berechtigungen.
          </CardContent>
        </Card>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquare, ShieldAlert, Users, Zap } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { RangeSelector } from "@/components/range-selector";
import { AreaChart, BarChart, DonutChart } from "@/components/charts";
import { EventBadge, ModerationBadge, SubTierBadge } from "@/components/twitch-badges";
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
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {canSeeChannels && (
          <Card>
            <CardHeader>
              <CardTitle>Aktivste Channels</CardTitle>
              <CardDescription>Nachrichten je Channel im gewählten Zeitraum.</CardDescription>
            </CardHeader>
            <CardContent>
              <BarChart
                data={topChannels}
                xKey="name"
                series={[{ key: "messages", label: "Nachrichten", color: "chart-2" }]}
                horizontal
                height={Math.max(180, topChannels.length * 34)}
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
            <CardDescription>Die gesprächigsten Zuschauer im gewählten Zeitraum.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              data={topChatters.map((chatter) => ({
                name: chatter.displayName ?? chatter.userName,
                messages: chatter.messages,
              }))}
              xKey="name"
              series={[{ key: "messages", label: "Nachrichten", color: "chart-3" }]}
              horizontal
              height={Math.max(180, topChatters.length * 34)}
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
                    <TableHead>Nutzer</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="text-right">Zeit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentEvents.length === 0 ? (
                    <TableEmpty colSpan={4}>Keine Events vorhanden.</TableEmpty>
                  ) : (
                    recentEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          <EventBadge type={event.eventType} />
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
                    <TableHead>Ziel</TableHead>
                    <TableHead>Dauer</TableHead>
                    <TableHead className="text-right">Zeit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentModeration.length === 0 ? (
                    <TableEmpty colSpan={4}>Keine Moderationsaktionen.</TableEmpty>
                  ) : (
                    recentModeration.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <ModerationBadge action={entry.action} />
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

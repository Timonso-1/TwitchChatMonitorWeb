import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PanelSurface } from "@/components/panel-surface";
import { SectionHeader } from "@/components/section-header";
import { DonutChart } from "@/components/charts";
import { RankingList } from "@/components/ranking-list";
import { EventBadge, ModerationBadge, SubTierBadge } from "@/components/twitch-badges";
import { ViewerAvatar } from "@/components/viewer-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCachedDashboardLead, getCachedDashboardSections } from "@/lib/queries/dashboard";
import { rangeParams, rangeSentence, type ResolvedRange } from "@/lib/range";
import { eventDetailText, eventTypeLabel, formatDuration } from "@/lib/twitch";
import { getCachedViewerAvatars } from "@/lib/twitch-api";
import { buildQueryString, formatRelative } from "@/lib/utils";

interface DashboardSectionsProps {
  range: ResolvedRange;
  canSeeChannels: boolean;
  canSeeEvents: boolean;
  canSeeModeration: boolean;
  canSeeViewers: boolean;
}

export async function DashboardSections({
  range,
  canSeeChannels,
  canSeeEvents,
  canSeeModeration,
  canSeeViewers,
}: DashboardSectionsProps) {
  const [{ stats }, sections] = await Promise.all([
    // Lead-Cache trifft hier meist schon – Events-Summe für Donut ohne Extra-Scan.
    getCachedDashboardLead(range),
    getCachedDashboardSections(range, {
      channels: canSeeChannels,
      events: canSeeEvents,
      moderation: canSeeModeration,
      viewers: canSeeViewers,
    }),
  ]);

  const { topChannels, eventDistribution, topChatters, recentEvents, recentModeration } = sections;
  const chatterAvatars = await getCachedViewerAvatars(topChatters.map((chatter) => chatter.userId));

  const rangePhrase = rangeSentence(range);
  const rangeQuery = buildQueryString(rangeParams(range));

  return (
    <>
      <div className="grid gap-8 xl:grid-cols-2">
        {canSeeChannels && (
          <section className="space-y-4">
            <SectionHeader
              title="Aktivste Channels"
              description={`Nachrichten je Channel in ${rangePhrase}.`}
              actions={
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/channels">
                    Alle Channels
                    <ArrowRight />
                  </Link>
                </Button>
              }
            />
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
          </section>
        )}

        {canSeeEvents && (
          <section className="space-y-4">
            <SectionHeader title="Event-Verteilung" description={`Anteile der Event-Typen in ${rangePhrase}.`} />
            <PanelSurface>
              <DonutChart
                data={eventDistribution.map((entry) => ({
                  name: eventTypeLabel(entry.name),
                  value: entry.value,
                }))}
                centerValue={stats.eventsRange}
                centerLabel="Events"
                emptyMessage="Keine Events im Zeitraum."
              />
            </PanelSurface>
          </section>
        )}
      </div>

      {canSeeViewers && (
        <section className="space-y-4">
          <SectionHeader
            title="Aktivste Chatter"
            description={`Die gesprächigsten Zuschauer in ${rangePhrase}.`}
            actions={
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/viewers${rangeQuery}`}>
                  Alle Zuschauer
                  <ArrowRight />
                </Link>
              </Button>
            }
          />
          <RankingList
            entries={topChatters.map((chatter) => {
              const name = chatter.displayName ?? chatter.userName;

              return {
                id: chatter.userId,
                label: name,
                sublabel:
                  chatter.displayName && chatter.displayName !== chatter.userName
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
            emptyMessage="Keine Chatter-Aktivität im Zeitraum."
          />
        </section>
      )}

      <div className="grid gap-8 xl:grid-cols-2">
        {canSeeEvents && (
          <section className="space-y-4">
            <SectionHeader
              title="Letzte Events"
              description={`Die jüngsten Ereignisse in ${rangePhrase}.`}
              actions={
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/events${rangeQuery}`}>
                    Alle Events
                    <ArrowRight />
                  </Link>
                </Button>
              }
            />
            <PanelSurface variant="flush">
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
                    <TableEmpty
                      colSpan={5}
                      title="Keine Events im Zeitraum"
                      description="Sobald Events erfasst werden, erscheinen sie hier."
                    />
                  ) : (
                    recentEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          <EventBadge type={event.eventType} />
                        </TableCell>
                        <TableCell className="max-w-24 truncate text-meta">{event.channelName}</TableCell>
                        <TableCell className="max-w-28 truncate">{event.userName ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <SubTierBadge tier={event.subTier} />
                            <span className="text-meta">
                              {eventDetailText({
                                months: event.months,
                                giftCount: event.giftCount,
                                viewerCount: event.viewerCount,
                                giftedByName: event.giftedByName,
                              })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-meta">
                          {formatRelative(event.occurredAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </PanelSurface>
          </section>
        )}

        {canSeeModeration && (
          <section className="space-y-4">
            <SectionHeader
              title="Letzte Moderationsaktionen"
              description={`Timeouts, Bans und Löschungen in ${rangePhrase}.`}
              actions={
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/moderation${rangeQuery}`}>
                    Alle Aktionen
                    <ArrowRight />
                  </Link>
                </Button>
              }
            />
            <PanelSurface variant="flush">
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
                    <TableEmpty
                      colSpan={5}
                      title="Keine Moderationsaktionen"
                      description="Im gewählten Zeitraum ist nichts aufgezeichnet."
                    />
                  ) : (
                    recentModeration.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <ModerationBadge action={entry.action} />
                        </TableCell>
                        <TableCell className="max-w-24 truncate text-meta">{entry.channelName}</TableCell>
                        <TableCell className="max-w-28 truncate">
                          {entry.targetUserId && canSeeViewers ? (
                            <Link href={`/viewers/${entry.targetUserId}`} className="hover:underline">
                              {entry.targetUserName ?? entry.targetUserId}
                            </Link>
                          ) : (
                            (entry.targetUserName ?? "—")
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-meta">
                          {formatDuration(entry.durationSeconds)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-meta">
                          {formatRelative(entry.occurredAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </PanelSurface>
          </section>
        )}
      </div>

      {!canSeeChannels && !canSeeEvents && !canSeeModeration && (
        <EmptyState
          title="Eingeschränkte Ansicht"
          description="Für weitere Auswertungen fehlen dir die Berechtigungen."
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]"
        />
      )}
    </>
  );
}

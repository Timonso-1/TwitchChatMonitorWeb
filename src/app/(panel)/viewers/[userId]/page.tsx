import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, Coins, Eye, MessageSquare, ShieldAlert, Zap } from "lucide-react";
import { AreaChart } from "@/components/charts";
import { ChatName } from "@/components/chat-name";
import { DistributionChart } from "@/components/distribution-chart";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { MessageContent } from "@/components/message-content";
import { StatCard } from "@/components/stat-card";
import { ChatRoleBadges, EventBadge, ModerationBadge, SubTierBadge } from "@/components/twitch-badges";
import { TwitchProfileLink } from "@/components/twitch-profile-link";
import { ViewerAvatar } from "@/components/viewer-avatar";
import { ViewerNotesPanel } from "@/components/viewer-notes-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardField, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ViewerTabsNav, normalizeViewerTab, type ViewerTabKey } from "./viewer-tabs";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  getSubscriptionInfo,
  getViewerActivity,
  getViewerChannelOptions,
  getViewerEventsPage,
  getViewerHourDistribution,
  getViewerMessagesPage,
  getViewerModerationPage,
  getViewerProfile,
  getViewerWeekdayDistribution,
} from "@/lib/queries/viewer-profile";
import { getMessageContext } from "@/lib/queries/twitch";
import { getViewerEmoteSummary } from "@/lib/queries/emotes";
import { eventDetailText, formatDuration, subTierLabel } from "@/lib/twitch";
import { emoteImageUrl } from "@/lib/twitch-tags";
import { getViewerAvatar } from "@/lib/twitch-api";
import { formatDateTime, formatNumber, formatRelative, parsePositiveInt, parseSearchParam } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DETAIL_PAGE_SIZE = 25;

/** Ausgeschriebene Wochentage für die Tooltips des Verteilungsdiagramms. */
const WEEKDAY_FULL: Record<string, string> = {
  Mo: "Montag",
  Di: "Dienstag",
  Mi: "Mittwoch",
  Do: "Donnerstag",
  Fr: "Freitag",
  Sa: "Samstag",
  So: "Sonntag",
};

export async function generateMetadata({ params }: { params: Promise<{ userId: string }> }): Promise<Metadata> {
  const { userId } = await params;
  const profile = await getViewerProfile(userId, { includeNotes: false, messageLimit: 1 });
  return { title: profile ? (profile.displayName ?? profile.userName) : "Zuschauer" };
}

export default async function ViewerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.VIEWERS_VIEW);
  const [{ userId }, query] = await Promise.all([params, searchParams]);

  const permissions = session.user.permissions;
  const canViewNotes = hasPermission(permissions, PERMISSIONS.VIEWERS_NOTES_VIEW);
  const canWriteNotes = hasPermission(permissions, PERMISSIONS.VIEWERS_NOTES_WRITE);
  const canDeleteForeignNotes = hasPermission(permissions, PERMISSIONS.VIEWERS_NOTES_DELETE);
  const canSeeMessages = hasPermission(permissions, PERMISSIONS.MESSAGES_VIEW);
  const canSeeEvents = hasPermission(permissions, PERMISSIONS.EVENTS_VIEW);
  const canSeeModeration = hasPermission(permissions, PERMISSIONS.MODERATION_VIEW);

  const tab = normalizeViewerTab(query.tab);
  const page = parsePositiveInt(query.page, 1);
  const basePath = `/viewers/${userId}`;

  // Filter des Nachrichten-Reiters
  const filterChannel = parseSearchParam(query.channel);
  const filterContent = parseSearchParam(query.content);
  const filterFrom = parseSearchParam(query.from);
  const filterTo = parseSearchParam(query.to);
  const filterBits = parseSearchParam(query.bits) === "1";

  const messageFilters = {
    channelUuid: filterChannel,
    content: filterContent,
    from: filterFrom,
    to: filterTo,
    withBits: filterBits,
  };

  // Bleibt beim Blättern und Filtern erhalten.
  const messageParams = {
    tab: "messages",
    channel: filterChannel,
    content: filterContent,
    from: filterFrom,
    to: filterTo,
    bits: filterBits ? "1" : undefined,
  };

  const hasMessageFilters = Boolean(filterChannel || filterContent || filterFrom || filterTo || filterBits);

  const [profile, avatar, subscription] = await Promise.all([
    getViewerProfile(userId, { includeNotes: canViewNotes, skipDetailLists: true }),
    getViewerAvatar(userId),
    getSubscriptionInfo(userId),
  ]);

  if (!profile) notFound();

  // Nur die Daten des aktiven Reiters laden.
  const [activity, hourDistribution, weekdayDistribution] =
    tab === "overview"
      ? await Promise.all([
          getViewerActivity(userId, 30),
          getViewerHourDistribution(userId),
          getViewerWeekdayDistribution(userId),
        ])
      : [[], [], []];

  const [messagesPage, messageChannels] =
    tab === "messages" && canSeeMessages
      ? await Promise.all([
          getViewerMessagesPage(userId, page, DETAIL_PAGE_SIZE, messageFilters),
          getViewerChannelOptions(userId),
        ])
      : [null, []];

  // Löschungen und Antwortbezüge nur laden, wenn Nachrichten sichtbar sind.
  const messageContext = messagesPage
    ? await getMessageContext(
        messagesPage.items.map((message) => ({
          ...message,
          userId,
          userName: profile?.userName ?? "",
          displayName: profile?.displayName ?? null,
        })),
      )
    : null;

  const emoteSummary = tab === "overview" && canSeeMessages ? await getViewerEmoteSummary(userId) : null;

  const eventsPage =
    tab === "events" && canSeeEvents ? await getViewerEventsPage(userId, page, DETAIL_PAGE_SIZE) : null;

  const moderationPage =
    tab === "moderation" && canSeeModeration
      ? await getViewerModerationPage(userId, page, DETAIL_PAGE_SIZE)
      : null;

  const roles = profile.lastKnownRoles;
  const displayName = profile.displayName ?? avatar?.displayName ?? profile.userName;
  const criticalNotes = profile.notes.filter((note) => note.severity === "critical").length;

  const availableTabs: ViewerTabKey[] = [
    "overview",
    ...(canSeeMessages ? (["messages"] as const) : []),
    ...(canSeeEvents ? (["events"] as const) : []),
    ...(canSeeModeration ? (["moderation"] as const) : []),
    ...(canViewNotes ? (["notes"] as const) : []),
  ];

  return (
    <>
      {/* Kopfbereich */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <ViewerAvatar name={displayName} imageUrl={avatar?.profileImageUrl} color={roles?.color} size="xl" />

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                <ChatName color={roles?.color}>{displayName}</ChatName>
              </h1>
              <TwitchProfileLink login={profile.userName} />

              {roles && (
                <ChatRoleBadges
                  isBroadcaster={roles.isBroadcaster}
                  isMod={roles.isMod}
                  isVip={roles.isVip}
                  isSubscriber={roles.isSubscriber}
                />
              )}
              {profile.highestSubTier && <SubTierBadge tier={profile.highestSubTier} />}
              {profile.banCount > 0 && <Badge variant="destructive">{profile.banCount}× gebannt</Badge>}
              {criticalNotes > 0 && <Badge variant="destructive">{criticalNotes} kritische Notiz(en)</Badge>}
            </div>

            <p className="font-mono text-xs text-[var(--color-subtle)]">
              {profile.displayName && profile.displayName !== profile.userName ? `@${profile.userName} · ` : ""}
              {profile.userId}
            </p>

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--color-muted-foreground)]">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5" />
                Erstmals gesehen {formatDateTime(profile.firstSeenAt)}
              </span>
              <span className="flex items-center gap-1.5">
                <Eye className="size-3.5" />
                Zuletzt {formatRelative(profile.lastSeenAt)}
              </span>
            </div>
          </div>

          <Button variant="outline" size="sm" asChild className="shrink-0">
            <Link href="/viewers">Zur Übersicht</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Nachrichten" value={profile.messageCount} icon={MessageSquare} />
        <StatCard label="Events" value={profile.eventCount} icon={Zap} accent="brand" />
        <StatCard label="Bits gespendet" value={profile.bitsTotal} icon={Coins} accent="success" />
        <StatCard
          label="Moderationsaktionen"
          value={profile.moderationCount}
          hint={
            profile.moderationCount > 0
              ? `${formatNumber(profile.banCount)} Banns · ${formatNumber(profile.timeoutCount)} Timeouts`
              : undefined
          }
          icon={ShieldAlert}
          accent={profile.moderationCount > 0 ? "destructive" : "neutral"}
        />
      </div>

      <ViewerTabsNav
        basePath={basePath}
        active={tab}
        available={availableTabs}
        counts={{
          messages: profile.messageCount,
          events: profile.eventCount,
          moderation: profile.moderationCount,
          notes: profile.notes.length,
        }}
      />

      {/* ------------------------------------------------------------ Überblick */}
      {tab === "overview" && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Nachrichtenverlauf</CardTitle>
                <CardDescription>Nachrichten pro Tag in den letzten 30 Tagen.</CardDescription>
              </CardHeader>
              <CardContent>
                <AreaChart
                  data={activity}
                  xKey="bucket"
                  series={[{ key: "messages", label: "Nachrichten", color: "chart-2" }]}
                  height={220}
                  xFormat="date"
                  labelFormat="weekday-long"
                  xLabel="Datum"
                  yLabel="Nachrichten"
                  emptyMessage="Keine Aktivität in den letzten 30 Tagen."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Aktivität nach Wochentag</CardTitle>
                <CardDescription>Gesamter erfasster Zeitraum.</CardDescription>
              </CardHeader>
              <CardContent>
                <DistributionChart
                  bars={weekdayDistribution.map((entry) => ({
                    label: entry.day,
                    fullLabel: WEEKDAY_FULL[entry.day] ?? entry.day,
                    value: entry.messages,
                  }))}
                  height={180}
                  accent="success"
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Aktivität nach Uhrzeit</CardTitle>
                <CardDescription>Wann dieser Zuschauer typischerweise schreibt.</CardDescription>
              </CardHeader>
              <CardContent>
                <DistributionChart
                  bars={hourDistribution.map((entry, hour) => ({
                    label: String(hour).padStart(2, "0"),
                    fullLabel: `${String(hour).padStart(2, "0")}:00 – ${String(hour).padStart(2, "0")}:59 Uhr`,
                    value: entry.messages,
                  }))}
                  height={160}
                  accent="info"
                  // Bei 24 Balken würde jede Beschriftung überlappen.
                  labelEvery={3}
                />
                <p className="pt-2 text-xs text-[var(--color-subtle)]">Stunde des Tages (Europe/Berlin)</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Stammdaten</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <CardField label="Benutzername">
                  <ChatName color={roles?.color} className="font-medium">
                    {profile.userName}
                  </ChatName>
                </CardField>
                <CardField label="Twitch-User-ID">
                  <span className="font-mono text-xs">{profile.userId}</span>
                </CardField>
                <CardField label="Höchste Abo-Stufe">
                  {profile.highestSubTier ? subTierLabel(profile.highestSubTier) : "Kein Abo bekannt"}
                </CardField>
                <CardField label="Abo-Dauer">
                  {subscription ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {formatNumber(subscription.maxMonths)} Monate
                      {subscription.isFounder && <Badge variant="primary">Gründer</Badge>}
                    </span>
                  ) : profile.subMonthsMax ? (
                    `${formatNumber(profile.subMonthsMax)} Monate`
                  ) : (
                    "—"
                  )}
                  {subscription && (
                    <span className="block text-xs text-[var(--color-subtle)]">
                      Laut Abzeichen, bestätigt {formatRelative(subscription.lastSeenAt)}
                    </span>
                  )}
                </CardField>
                <CardField label="Twitch-Kanal">
                  <TwitchProfileLink login={profile.userName} withLabel />
                </CardField>
              </CardContent>
            </Card>
          </div>

          {emoteSummary && emoteSummary.topEmotes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Meistgenutzte Emotes</CardTitle>
                <CardDescription>
                  Aus {formatNumber(emoteSummary.scanned)} Nachrichten mit Emotes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {emoteSummary.topEmotes.map((emote) => (
                    <span
                      key={emote.id}
                      title={`${emote.name} · ${formatNumber(emote.uses)}× verwendet`}
                      className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={emoteImageUrl(emote.id, "1.0")}
                        alt={emote.name}
                        width={22}
                        height={22}
                        loading="lazy"
                        className="size-[22px] object-contain"
                      />
                      <span className="text-sm">{emote.name}</span>
                      <span className="text-xs tabular-nums text-[var(--color-subtle)]">
                        {formatNumber(emote.uses)}×
                      </span>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Aktivität nach Channel</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Nachrichten</TableHead>
                    <TableHead className="text-right">Letzte Nachricht</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profile.channels.length === 0 ? (
                    <TableEmpty colSpan={3} title="Keine Nachrichten aufgezeichnet" />
                  ) : (
                    profile.channels.map((entry) => (
                      <TableRow key={entry.channelName}>
                        <TableCell className="font-medium">{entry.channelName}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(entry.messageCount)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right text-xs text-[var(--color-muted-foreground)]">
                          {formatRelative(entry.lastMessageAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* ---------------------------------------------------------- Nachrichten */}
      {tab === "messages" && messagesPage && (
        <>
          <FilterBar action={basePath} hasActiveFilters={hasMessageFilters}>
            {/* Ohne dieses Feld springt das Formular zurück auf den Überblick. */}
            <input type="hidden" name="tab" value="messages" />

            <FilterField label="Channel">
              <Select name="channel" defaultValue={filterChannel ?? ""}>
                <option value="">Alle Channels</option>
                {messageChannels.map((channel) => (
                  <option key={channel.uuid} value={channel.uuid}>
                    {channel.name}
                  </option>
                ))}
              </Select>
            </FilterField>

            <FilterField label="Inhalt">
              <Input name="content" defaultValue={filterContent ?? ""} placeholder="Textsuche" />
            </FilterField>

            <FilterField label="Von" className="w-full space-y-1.5 sm:w-40">
              <Input type="date" name="from" defaultValue={filterFrom ?? ""} />
            </FilterField>

            <FilterField label="Bis" className="w-full space-y-1.5 sm:w-40">
              <Input type="date" name="to" defaultValue={filterTo ?? ""} />
            </FilterField>

            <FilterField label="Filter" className="w-full space-y-1.5 sm:w-40">
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="bits"
                  value="1"
                  defaultChecked={filterBits}
                  className="size-4 accent-[var(--color-brand)]"
                />
                Nur mit Bits (Cheers)
              </label>
            </FilterField>
          </FilterBar>

          <Card>
            <CardHeader>
              <CardTitle>Nachrichten</CardTitle>
              <CardDescription>
                {hasMessageFilters
                  ? `${formatNumber(messagesPage.total)} Treffer für die gewählten Filter.`
                  : "Vollständiger Chatverlauf dieses Zuschauers, neueste zuerst."}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Zeit</TableHead>
                  <TableHead className="w-28">Channel</TableHead>
                  <TableHead>Nachricht</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messagesPage.items.length === 0 ? (
                  <TableEmpty
                    colSpan={3}
                    title={
                      hasMessageFilters
                        ? "Keine Nachrichten für die gewählten Filter"
                        : "Keine Nachrichten vorhanden"
                    }
                  />
                ) : (
                  messagesPage.items.map((message) => (
                    <TableRow key={message.id}>
                      <TableCell className="whitespace-nowrap text-meta">
                        {formatDateTime(message.receivedAt)}
                      </TableCell>
                      <TableCell className="text-meta">
                        {message.channelName}
                      </TableCell>
                      <TableCell className="max-w-xl">
                        <MessageContent
                          content={message.content}
                          emotes={message.emotes}
                          badgeInfo={message.badgeInfo}
                          isAction={message.isAction}
                          bits={message.bits}
                          isFirstMessage={message.isFirstMessage}
                          isDeleted={messageContext?.deletedIds.has(message.messageId)}
                          replyTo={
                            message.replyToMessageId
                              ? (messageContext?.replyTargets.get(message.replyToMessageId) ?? null)
                              : null
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

              <Pagination
                basePath={basePath}
                params={messageParams}
                page={page}
                pageSize={DETAIL_PAGE_SIZE}
                total={messagesPage.total}
                itemLabel="Nachrichten"
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* --------------------------------------------------------------- Events */}
      {tab === "events" && eventsPage && (
        <Card>
          <CardHeader>
            <CardTitle>Abos, Cheers und Raids</CardTitle>
            <CardDescription>Alle aufgezeichneten Events dieses Zuschauers.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Zeit</TableHead>
                  <TableHead className="w-32">Typ</TableHead>
                  <TableHead className="w-28">Channel</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventsPage.items.length === 0 ? (
                  <TableEmpty colSpan={4} title="Keine Events aufgezeichnet" />
                ) : (
                  eventsPage.items.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="whitespace-nowrap text-meta">
                        {formatDateTime(event.occurredAt)}
                      </TableCell>
                      <TableCell>
                        <EventBadge type={event.eventType} />
                      </TableCell>
                      <TableCell className="text-meta">
                        {event.channelName}
                      </TableCell>
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
                        {event.message && (
                          <p className="mt-0.5 truncate text-[var(--color-subtle)]">{event.message}</p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <Pagination
              basePath={basePath}
              params={{ tab: "events" }}
              page={page}
              pageSize={DETAIL_PAGE_SIZE}
              total={eventsPage.total}
              itemLabel="Events"
            />
          </CardContent>
        </Card>
      )}

      {/* ----------------------------------------------------------- Moderation */}
      {tab === "moderation" && moderationPage && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Aktionen gesamt" value={profile.moderationCount} icon={ShieldAlert} accent="warning" />
            <StatCard label="Banns" value={profile.banCount} icon={ShieldAlert} accent="destructive" />
            <StatCard label="Timeouts" value={profile.timeoutCount} icon={Clock} accent="warning" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Moderationshistorie</CardTitle>
              <CardDescription>Alle Maßnahmen gegen diesen Zuschauer.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Zeit</TableHead>
                    <TableHead className="w-36">Aktion</TableHead>
                    <TableHead className="w-28">Channel</TableHead>
                    <TableHead className="w-24">Dauer</TableHead>
                    <TableHead>Grund</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moderationPage.items.length === 0 ? (
                    <TableEmpty
                      colSpan={5}
                      title="Keine Moderationsaktionen"
                      description="Sauberer Verlauf — nichts aufgezeichnet."
                    />
                  ) : (
                    moderationPage.items.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap text-meta">
                          {formatDateTime(entry.occurredAt)}
                        </TableCell>
                        <TableCell>
                          <ModerationBadge action={entry.action} />
                        </TableCell>
                        <TableCell className="text-meta">
                          {entry.channelName}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {formatDuration(entry.durationSeconds)}
                        </TableCell>
                        <TableCell className="max-w-sm text-xs">
                          {entry.reason ?? "—"}
                          {entry.deletedMessageContent && (
                            <p className="mt-0.5 truncate text-[var(--color-subtle)]">
                              „{entry.deletedMessageContent}“
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <Pagination
                basePath={basePath}
                params={{ tab: "moderation" }}
                page={page}
                pageSize={DETAIL_PAGE_SIZE}
                total={moderationPage.total}
                itemLabel="Aktionen"
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* -------------------------------------------------------------- Notizen */}
      {tab === "notes" && canViewNotes && (
        <div className="max-w-3xl">
          <ViewerNotesPanel
            viewerUserId={profile.userId}
            notes={profile.notes.map((note) => ({
              id: note.id,
              content: note.content,
              severity: note.severity,
              pinned: note.pinned,
              authorName: note.authorName,
              isOwn: note.authorUuid === session.user.uuid,
              createdAt: note.createdAt.toISOString(),
              updatedAt: note.updatedAt.toISOString(),
            }))}
            canWrite={canWriteNotes}
            canDeleteForeign={canDeleteForeignNotes}
          />
        </div>
      )}
    </>
  );
}

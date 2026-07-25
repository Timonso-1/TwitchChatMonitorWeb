import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, Coins, Eye, MessageSquare, ShieldAlert, Zap } from "lucide-react";
import { AreaChart, BarChart } from "@/components/charts";
import { StatCard } from "@/components/stat-card";
import { ChatRoleBadges, EventBadge, ModerationBadge, SubTierBadge } from "@/components/twitch-badges";
import { ViewerAvatar } from "@/components/viewer-avatar";
import { ViewerNotesPanel } from "@/components/viewer-notes-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardField, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ViewerTabs } from "./viewer-tabs";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import {
  getViewerActivity,
  getViewerHourDistribution,
  getViewerProfile,
  getViewerWeekdayDistribution,
} from "@/lib/queries/viewer-profile";
import { eventDetailText, formatDuration, subTierLabel } from "@/lib/twitch";
import { getViewerAvatar } from "@/lib/twitch-api";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ userId: string }> }): Promise<Metadata> {
  const { userId } = await params;
  const profile = await getViewerProfile(userId, { includeNotes: false, messageLimit: 1 });
  return { title: profile ? (profile.displayName ?? profile.userName) : "Zuschauer" };
}

export default async function ViewerProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await requirePermission(PERMISSIONS.VIEWERS_VIEW);
  const { userId } = await params;

  const permissions = session.user.permissions;
  const canViewNotes = hasPermission(permissions, PERMISSIONS.VIEWERS_NOTES_VIEW);
  const canWriteNotes = hasPermission(permissions, PERMISSIONS.VIEWERS_NOTES_WRITE);
  const canDeleteForeignNotes = hasPermission(permissions, PERMISSIONS.VIEWERS_NOTES_DELETE);
  const canSeeMessages = hasPermission(permissions, PERMISSIONS.MESSAGES_VIEW);
  const canSeeEvents = hasPermission(permissions, PERMISSIONS.EVENTS_VIEW);
  const canSeeModeration = hasPermission(permissions, PERMISSIONS.MODERATION_VIEW);

  const [profile, activity, hourDistribution, weekdayDistribution, avatar] = await Promise.all([
    getViewerProfile(userId, { includeNotes: canViewNotes }),
    getViewerActivity(userId, 30),
    getViewerHourDistribution(userId),
    getViewerWeekdayDistribution(userId),
    getViewerAvatar(userId),
  ]);

  if (!profile) notFound();

  const roles = profile.lastKnownRoles;
  const displayName = profile.displayName ?? avatar?.displayName ?? profile.userName;
  const criticalNotes = profile.notes.filter((note) => note.severity === "critical").length;

  // ---------------------------------------------------------------- Überblick
  const overview = (
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
            <BarChart
              data={weekdayDistribution}
              xKey="day"
              series={[{ key: "messages", label: "Nachrichten", color: "chart-3" }]}
              height={220}
              xLabel="Wochentag"
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
            <BarChart
              data={hourDistribution}
              xKey="hour"
              series={[{ key: "messages", label: "Nachrichten", color: "chart-5" }]}
              height={200}
              xFormat="hour-short"
              xLabel="Stunde des Tages (0–23 Uhr)"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stammdaten</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <CardField label="Benutzername">
              <span className="font-medium" style={roles?.color ? { color: roles.color } : undefined}>
                {profile.userName}
              </span>
            </CardField>
            <CardField label="Twitch-User-ID">
              <span className="font-mono text-xs">{profile.userId}</span>
            </CardField>
            <CardField label="Höchste Abo-Stufe">
              {profile.highestSubTier ? subTierLabel(profile.highestSubTier) : "Kein Abo bekannt"}
            </CardField>
            <CardField label="Längste Abo-Dauer">
              {profile.subMonthsMax ? `${formatNumber(profile.subMonthsMax)} Monate` : "—"}
            </CardField>
          </CardContent>
        </Card>
      </div>

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
                <TableEmpty colSpan={3}>Keine Nachrichten aufgezeichnet.</TableEmpty>
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
  );

  // ------------------------------------------------------------- Nachrichten
  const messagesTab = canSeeMessages ? (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Letzte Nachrichten</CardTitle>
          <CardDescription>Die 25 neuesten Chatnachrichten dieses Zuschauers.</CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/messages?user=${encodeURIComponent(profile.userName)}`}>Alle ansehen</Link>
        </Button>
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
            {profile.recentMessages.length === 0 ? (
              <TableEmpty colSpan={3}>Keine Nachrichten vorhanden.</TableEmpty>
            ) : (
              profile.recentMessages.map((message) => (
                <TableRow key={message.id}>
                  <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                    {formatDateTime(message.receivedAt)}
                  </TableCell>
                  <TableCell className="text-xs text-[var(--color-muted-foreground)]">{message.channelName}</TableCell>
                  <TableCell className="max-w-xl">
                    <span className={message.isAction ? "italic text-[var(--color-brand)]" : undefined}>
                      {message.content}
                    </span>
                    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                      {message.bits > 0 && <Badge variant="success">{formatNumber(message.bits)} Bits</Badge>}
                      {message.isFirstMessage && <Badge variant="warning">Erste Nachricht</Badge>}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  ) : null;

  // ------------------------------------------------------------------ Events
  const eventsTab = canSeeEvents ? (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Abos, Cheers und Raids</CardTitle>
          <CardDescription>Die 25 neuesten Events dieses Zuschauers.</CardDescription>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/events?user=${encodeURIComponent(profile.userName)}`}>Alle ansehen</Link>
        </Button>
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
            {profile.eventHistory.length === 0 ? (
              <TableEmpty colSpan={4}>Keine Events aufgezeichnet.</TableEmpty>
            ) : (
              profile.eventHistory.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                    {formatDateTime(event.occurredAt)}
                  </TableCell>
                  <TableCell>
                    <EventBadge type={event.eventType} />
                  </TableCell>
                  <TableCell className="text-xs text-[var(--color-muted-foreground)]">{event.channelName}</TableCell>
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
                    {event.message && <p className="mt-0.5 truncate text-[var(--color-subtle)]">{event.message}</p>}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  ) : null;

  // -------------------------------------------------------------- Moderation
  const moderationTab = canSeeModeration ? (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Aktionen gesamt" value={profile.moderationCount} icon={ShieldAlert} accent="warning" />
        <StatCard label="Banns" value={profile.banCount} icon={ShieldAlert} accent="destructive" />
        <StatCard label="Timeouts" value={profile.timeoutCount} icon={Clock} accent="warning" />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Moderationshistorie</CardTitle>
            <CardDescription>Die 25 neuesten Maßnahmen gegen diesen Zuschauer.</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/moderation?target=${encodeURIComponent(profile.userName)}`}>Alle ansehen</Link>
          </Button>
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
              {profile.moderationHistory.length === 0 ? (
                <TableEmpty colSpan={5}>Keine Moderationsaktionen — sauberer Verlauf.</TableEmpty>
              ) : (
                profile.moderationHistory.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                      {formatDateTime(entry.occurredAt)}
                    </TableCell>
                    <TableCell>
                      <ModerationBadge action={entry.action} />
                    </TableCell>
                    <TableCell className="text-xs text-[var(--color-muted-foreground)]">{entry.channelName}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{formatDuration(entry.durationSeconds)}</TableCell>
                    <TableCell className="max-w-sm text-xs">
                      {entry.reason ?? "—"}
                      {entry.deletedMessageContent && (
                        <p className="mt-0.5 truncate text-[var(--color-subtle)]">„{entry.deletedMessageContent}“</p>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  ) : null;

  // ----------------------------------------------------------------- Notizen
  const notesTab = canViewNotes ? (
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
  ) : null;

  return (
    <>
      {/* Kopfbereich im Stil der Referenz */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <ViewerAvatar
            name={displayName}
            imageUrl={avatar?.profileImageUrl}
            color={roles?.color}
            size="xl"
          />

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{displayName}</h1>
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

      <ViewerTabs
        overview={overview}
        messages={messagesTab}
        events={eventsTab}
        moderation={moderationTab}
        notes={notesTab}
        counts={{
          messages: profile.recentMessages.length,
          events: profile.eventHistory.length,
          moderation: profile.moderationCount,
          notes: profile.notes.length,
        }}
      />
    </>
  );
}

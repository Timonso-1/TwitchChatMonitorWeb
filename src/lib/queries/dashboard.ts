import "server-only";
import { unstable_cache } from "next/cache";
import { and, count, desc, eq, gte, inArray, lt, lte, sql, type SQL } from "drizzle-orm";
import type { MySqlColumn } from "drizzle-orm/mysql-core";
import { db } from "@/lib/db";
import { channels, events, messages, moderationActions, viewers } from "@/lib/db/schema";
import { inRange } from "@/lib/queries/range-filter";
import type { ResolvedRange } from "@/lib/range";

export interface DashboardStats {
  channelsTotal: number;
  channelsActive: number;
  messagesTotal: number;
  messagesRange: number;
  messagesPrevious: number;
  eventsRange: number;
  eventsPrevious: number;
  moderationRange: number;
  moderationPrevious: number;
  viewersTotal: number;
  uniqueChattersRange: number;
  uniqueChattersPrevious: number;
  bitsRange: number;
  /** false, wenn die Vorperiode vor dem ersten Datensatz liegt. */
  comparable: boolean;
}

function previousPeriod(column: MySqlColumn, range: ResolvedRange): SQL {
  return and(gte(column, range.previousStart), lt(column, range.start))!;
}

/** Gesamtnachrichten ändern sich ständig – kurz cachen, teurer Full-Count. */
const getMessagesTotalCached = unstable_cache(
  async () => {
    const [row] = await db.select({ value: count() }).from(messages);
    return row?.value ?? 0;
  },
  ["messages-total-count"],
  { revalidate: 60 },
);

export async function getDashboardStats(range: ResolvedRange): Promise<DashboardStats> {
  // Früher 14 Einzelabfragen; jetzt gebündelt + gecachter Gesamtzähler.
  const [
    channelRow,
    viewersTotalRow,
    messagesTotal,
    messageCurrent,
    messagePrevious,
    eventTotals,
    moderationTotals,
    priorSample,
  ] = await Promise.all([
    db
      .select({
        total: count(),
        active: sql<number>`COALESCE(SUM(CASE WHEN ${channels.active} THEN 1 ELSE 0 END), 0)`.mapWith(Number),
      })
      .from(channels),
    db.select({ value: count() }).from(viewers),
    getMessagesTotalCached(),
    db
      .select({
        messages: count(),
        uniqueChatters: sql<number>`COUNT(DISTINCT ${messages.userId})`.mapWith(Number),
        bits: sql<number>`COALESCE(SUM(${messages.bits}), 0)`.mapWith(Number),
      })
      .from(messages)
      .where(inRange(messages.receivedAt, range)),
    db
      .select({
        messages: count(),
        uniqueChatters: sql<number>`COUNT(DISTINCT ${messages.userId})`.mapWith(Number),
      })
      .from(messages)
      .where(previousPeriod(messages.receivedAt, range)),
    db
      .select({
        current: sql<number>`COALESCE(SUM(CASE WHEN ${events.occurredAt} >= ${range.start} AND ${events.occurredAt} <= ${range.end} THEN 1 ELSE 0 END), 0)`.mapWith(
          Number,
        ),
        previous: sql<number>`COALESCE(SUM(CASE WHEN ${events.occurredAt} >= ${range.previousStart} AND ${events.occurredAt} < ${range.start} THEN 1 ELSE 0 END), 0)`.mapWith(
          Number,
        ),
      })
      .from(events)
      .where(and(gte(events.occurredAt, range.previousStart), lte(events.occurredAt, range.end))),
    db
      .select({
        current: sql<number>`COALESCE(SUM(CASE WHEN ${moderationActions.occurredAt} >= ${range.start} AND ${moderationActions.occurredAt} <= ${range.end} THEN 1 ELSE 0 END), 0)`.mapWith(
          Number,
        ),
        previous: sql<number>`COALESCE(SUM(CASE WHEN ${moderationActions.occurredAt} >= ${range.previousStart} AND ${moderationActions.occurredAt} < ${range.start} THEN 1 ELSE 0 END), 0)`.mapWith(
          Number,
        ),
      })
      .from(moderationActions)
      .where(and(gte(moderationActions.occurredAt, range.previousStart), lte(moderationActions.occurredAt, range.end))),
    // EXISTS statt MIN – bricht nach dem ersten Treffer ab.
    db
      .select({ value: sql<number>`1`.mapWith(Number) })
      .from(messages)
      .where(lt(messages.receivedAt, range.start))
      .limit(1),
  ]);

  return {
    channelsTotal: channelRow[0]?.total ?? 0,
    channelsActive: channelRow[0]?.active ?? 0,
    messagesTotal,
    messagesRange: messageCurrent[0]?.messages ?? 0,
    messagesPrevious: messagePrevious[0]?.messages ?? 0,
    eventsRange: eventTotals[0]?.current ?? 0,
    eventsPrevious: eventTotals[0]?.previous ?? 0,
    moderationRange: moderationTotals[0]?.current ?? 0,
    moderationPrevious: moderationTotals[0]?.previous ?? 0,
    viewersTotal: viewersTotalRow[0]?.value ?? 0,
    uniqueChattersRange: messageCurrent[0]?.uniqueChatters ?? 0,
    uniqueChattersPrevious: messagePrevious[0]?.uniqueChatters ?? 0,
    bitsRange: messageCurrent[0]?.bits ?? 0,
    comparable: (priorSample[0]?.value ?? 0) === 1,
  };
}

export interface ActivityPoint {
  /** ISO-Zeitpunkt des Intervallbeginns. */
  bucket: string;
  messages: number;
  events: number;
  moderation: number;
}

/**
 * Aktivitätsverlauf. Bei einem Tag wird stundenweise gruppiert,
 * darüber tageweise. Lücken werden mit Nullwerten aufgefüllt,
 * damit die Kurve nicht springt.
 */
export async function getActivityTimeline(range: ResolvedRange): Promise<ActivityPoint[]> {
  const hourly = range.hourly;
  const format = hourly ? "%Y-%m-%d %H:00:00" : "%Y-%m-%d 00:00:00";

  const [messageRows, eventRows, moderationRows] = await Promise.all([
    db
      .select({
        bucket: sql<string>`DATE_FORMAT(${messages.receivedAt}, ${format})`,
        total: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(messages)
      .where(inRange(messages.receivedAt, range))
      .groupBy(sql`DATE_FORMAT(${messages.receivedAt}, ${format})`),

    db
      .select({
        bucket: sql<string>`DATE_FORMAT(${events.occurredAt}, ${format})`,
        total: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(events)
      .where(inRange(events.occurredAt, range))
      .groupBy(sql`DATE_FORMAT(${events.occurredAt}, ${format})`),

    db
      .select({
        bucket: sql<string>`DATE_FORMAT(${moderationActions.occurredAt}, ${format})`,
        total: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(moderationActions)
      .where(inRange(moderationActions.occurredAt, range))
      .groupBy(sql`DATE_FORMAT(${moderationActions.occurredAt}, ${format})`),
  ]);

  const messageMap = new Map(messageRows.map((row) => [row.bucket, row.total]));
  const eventMap = new Map(eventRows.map((row) => [row.bucket, row.total]));
  const moderationMap = new Map(moderationRows.map((row) => [row.bucket, row.total]));

  const points: ActivityPoint[] = [];
  const stepMs = hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  const start = new Date(range.start);
  if (hourly) start.setMinutes(0, 0, 0);
  else start.setHours(0, 0, 0, 0);

  for (let time = start.getTime(); time <= range.end.getTime(); time += stepMs) {
    const date = new Date(time);
    const key = hourly
      ? `${formatSqlDate(date)} ${String(date.getHours()).padStart(2, "0")}:00:00`
      : `${formatSqlDate(date)} 00:00:00`;

    points.push({
      bucket: date.toISOString(),
      messages: messageMap.get(key) ?? 0,
      events: eventMap.get(key) ?? 0,
      moderation: moderationMap.get(key) ?? 0,
    });
  }

  return points;
}

function formatSqlDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface ChannelActivity {
  uuid: string;
  name: string;
  active: boolean;
  messages: number;
}

export async function getTopChannels(range: ResolvedRange, limit = 8): Promise<ChannelActivity[]> {
  // Erst die Top-Channels aus messages, dann Stammdaten – vermeidet LEFT JOIN über alle Channels.
  const top = await db
    .select({
      channelUuid: messages.channelUuid,
      messages: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(messages)
    .where(inRange(messages.receivedAt, range))
    .groupBy(messages.channelUuid)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit);

  if (top.length === 0) return [];

  const channelRows = await db
    .select({
      uuid: channels.uuid,
      name: channels.name,
      active: channels.active,
    })
    .from(channels)
    .where(
      inArray(
        channels.uuid,
        top.map((row) => row.channelUuid),
      ),
    );

  const byUuid = new Map(channelRows.map((row) => [row.uuid, row]));

  return top.flatMap((row) => {
    const channel = byUuid.get(row.channelUuid);
    if (!channel) return [];
    return [{ uuid: channel.uuid, name: channel.name, active: channel.active, messages: row.messages }];
  });
}

export interface EventTypeShare {
  name: string;
  value: number;
}

/** Verteilung der Event-Typen im Zeitraum. */
export async function getEventDistribution(range: ResolvedRange, limit = 6): Promise<EventTypeShare[]> {
  const rows = await db
    .select({
      eventType: events.eventType,
      total: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(events)
    .where(inRange(events.occurredAt, range))
    .groupBy(events.eventType)
    .orderBy(desc(sql`COUNT(*)`));

  const top = rows.slice(0, limit).map((row) => ({ name: row.eventType, value: row.total }));
  const restTotal = rows.slice(limit).reduce((sum, row) => sum + row.total, 0);

  if (restTotal > 0) top.push({ name: "Sonstige", value: restTotal });
  return top;
}

export interface RecentEvent {
  id: number;
  channelName: string;
  eventType: string;
  userName: string | null;
  giftedByName: string | null;
  subTier: string | null;
  months: number | null;
  giftCount: number | null;
  viewerCount: number | null;
  occurredAt: Date;
}

export async function getRecentEvents(range: ResolvedRange, limit = 8): Promise<RecentEvent[]> {
  return db
    .select({
      id: events.id,
      channelName: events.channelName,
      eventType: events.eventType,
      userName: events.userName,
      giftedByName: events.giftedByName,
      subTier: events.subTier,
      months: events.months,
      giftCount: events.giftCount,
      viewerCount: events.viewerCount,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .where(inRange(events.occurredAt, range))
    .orderBy(desc(events.occurredAt))
    .limit(limit);
}

export interface RecentModerationAction {
  id: number;
  channelName: string;
  action: string;
  targetUserId: string | null;
  targetUserName: string | null;
  durationSeconds: number | null;
  reason: string | null;
  occurredAt: Date;
}

export async function getRecentModeration(range: ResolvedRange, limit = 8): Promise<RecentModerationAction[]> {
  return db
    .select({
      id: moderationActions.id,
      channelName: moderationActions.channelName,
      action: moderationActions.action,
      targetUserId: moderationActions.targetUserId,
      targetUserName: moderationActions.targetUserName,
      durationSeconds: moderationActions.durationSeconds,
      reason: moderationActions.reason,
      occurredAt: moderationActions.occurredAt,
    })
    .from(moderationActions)
    .where(inRange(moderationActions.occurredAt, range))
    .orderBy(desc(moderationActions.occurredAt))
    .limit(limit);
}

export interface TopChatter {
  userId: string;
  userName: string;
  displayName: string | null;
  messages: number;
}

/** Aktivste Chatter im Zeitraum. */
export async function getTopChatters(range: ResolvedRange, limit = 8): Promise<TopChatter[]> {
  return db
    .select({
      userId: messages.userId,
      userName: messages.userName,
      displayName: sql<string | null>`MAX(${messages.displayName})`,
      messages: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(messages)
    .where(inRange(messages.receivedAt, range))
    .groupBy(messages.userId, messages.userName)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit);
}

/** Serialisierbarer Cache-Key für den Dashboard-Zeitraum. */
export function dashboardRangeCacheKey(range: ResolvedRange): string {
  return `${range.key}:${range.fromDate}:${range.toDate}:${range.hourly ? "h" : "d"}`;
}

/**
 * Gebündelte Dashboard-Abfragen mit kurzem Cache.
 * Auth bleibt dynamisch – nur die teuren Aggregationen werden wiederverwendet.
 */
export function getCachedDashboardLead(range: ResolvedRange) {
  const key = dashboardRangeCacheKey(range);

  return unstable_cache(
    async () => {
      const [stats, timeline] = await Promise.all([getDashboardStats(range), getActivityTimeline(range)]);
      return { stats, timeline };
    },
    ["dashboard-lead", key],
    { revalidate: 30 },
  )();
}

export function getCachedDashboardSections(
  range: ResolvedRange,
  options: { channels: boolean; events: boolean; moderation: boolean; viewers: boolean },
) {
  const key = dashboardRangeCacheKey(range);
  const flags = `${options.channels ? 1 : 0}${options.events ? 1 : 0}${options.moderation ? 1 : 0}${options.viewers ? 1 : 0}`;

  return unstable_cache(
    async () => {
      const [topChannels, eventDistribution, topChatters, recentEvents, recentModeration] = await Promise.all([
        options.channels ? getTopChannels(range) : Promise.resolve([]),
        options.events ? getEventDistribution(range) : Promise.resolve([]),
        options.viewers ? getTopChatters(range) : Promise.resolve([]),
        options.events ? getRecentEvents(range, 6) : Promise.resolve([]),
        options.moderation ? getRecentModeration(range, 6) : Promise.resolve([]),
      ]);

      return { topChannels, eventDistribution, topChatters, recentEvents, recentModeration };
    },
    ["dashboard-sections", key, flags],
    { revalidate: 30 },
  )();
}

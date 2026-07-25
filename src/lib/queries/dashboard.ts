import "server-only";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { channels, events, messages, moderationActions, viewers } from "@/lib/db/schema";

export interface DashboardStats {
  channelsTotal: number;
  channelsActive: number;
  messagesTotal: number;
  messagesRange: number;
  eventsRange: number;
  moderationRange: number;
  viewersTotal: number;
  uniqueChattersRange: number;
  bitsRange: number;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** Erlaubte Zeitraeume der Dashboard-Ansicht. */
export const RANGE_OPTIONS = [
  { value: 1, label: "24 Stunden" },
  { value: 7, label: "7 Tage" },
  { value: 30, label: "30 Tage" },
  { value: 90, label: "90 Tage" },
] as const;

export type RangeDays = (typeof RANGE_OPTIONS)[number]["value"];

export function normalizeRange(value: unknown): RangeDays {
  const parsed = Number(value);
  const match = RANGE_OPTIONS.find((option) => option.value === parsed);
  return match?.value ?? 7;
}

export async function getDashboardStats(days: number): Promise<DashboardStats> {
  const since = daysAgo(days);

  const [
    channelsTotalRow,
    channelsActiveRow,
    messagesTotalRow,
    messagesRangeRow,
    eventsRangeRow,
    moderationRangeRow,
    viewersTotalRow,
    uniqueChattersRow,
    bitsRow,
  ] = await Promise.all([
    db.select({ value: count() }).from(channels),
    db.select({ value: count() }).from(channels).where(eq(channels.active, true)),
    db.select({ value: count() }).from(messages),
    db.select({ value: count() }).from(messages).where(gte(messages.receivedAt, since)),
    db.select({ value: count() }).from(events).where(gte(events.occurredAt, since)),
    db.select({ value: count() }).from(moderationActions).where(gte(moderationActions.occurredAt, since)),
    db.select({ value: count() }).from(viewers),
    db
      .select({ value: sql<number>`COUNT(DISTINCT ${messages.userId})`.mapWith(Number) })
      .from(messages)
      .where(gte(messages.receivedAt, since)),
    db
      .select({ value: sql<number>`COALESCE(SUM(${messages.bits}), 0)`.mapWith(Number) })
      .from(messages)
      .where(gte(messages.receivedAt, since)),
  ]);

  return {
    channelsTotal: channelsTotalRow[0]?.value ?? 0,
    channelsActive: channelsActiveRow[0]?.value ?? 0,
    messagesTotal: messagesTotalRow[0]?.value ?? 0,
    messagesRange: messagesRangeRow[0]?.value ?? 0,
    eventsRange: eventsRangeRow[0]?.value ?? 0,
    moderationRange: moderationRangeRow[0]?.value ?? 0,
    viewersTotal: viewersTotalRow[0]?.value ?? 0,
    uniqueChattersRange: uniqueChattersRow[0]?.value ?? 0,
    bitsRange: bitsRow[0]?.value ?? 0,
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
 * Aktivitaetsverlauf. Bei einem Tag wird stundenweise gruppiert,
 * darueber tageweise. Luecken werden mit Nullwerten aufgefuellt,
 * damit die Kurve nicht springt.
 */
export async function getActivityTimeline(days: number): Promise<ActivityPoint[]> {
  const since = daysAgo(days);
  const hourly = days <= 1;
  const format = hourly ? "%Y-%m-%d %H:00:00" : "%Y-%m-%d 00:00:00";

  const [messageRows, eventRows, moderationRows] = await Promise.all([
    db
      .select({
        bucket: sql<string>`DATE_FORMAT(${messages.receivedAt}, ${format})`,
        total: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(messages)
      .where(gte(messages.receivedAt, since))
      .groupBy(sql`DATE_FORMAT(${messages.receivedAt}, ${format})`),

    db
      .select({
        bucket: sql<string>`DATE_FORMAT(${events.occurredAt}, ${format})`,
        total: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(events)
      .where(gte(events.occurredAt, since))
      .groupBy(sql`DATE_FORMAT(${events.occurredAt}, ${format})`),

    db
      .select({
        bucket: sql<string>`DATE_FORMAT(${moderationActions.occurredAt}, ${format})`,
        total: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(moderationActions)
      .where(gte(moderationActions.occurredAt, since))
      .groupBy(sql`DATE_FORMAT(${moderationActions.occurredAt}, ${format})`),
  ]);

  const messageMap = new Map(messageRows.map((row) => [row.bucket, row.total]));
  const eventMap = new Map(eventRows.map((row) => [row.bucket, row.total]));
  const moderationMap = new Map(moderationRows.map((row) => [row.bucket, row.total]));

  const points: ActivityPoint[] = [];
  const stepMs = hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  const start = new Date(since);
  if (hourly) start.setMinutes(0, 0, 0);
  else start.setHours(0, 0, 0, 0);

  for (let time = start.getTime(); time <= Date.now(); time += stepMs) {
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

export async function getTopChannels(days: number, limit = 8): Promise<ChannelActivity[]> {
  const since = daysAgo(days);

  return db
    .select({
      uuid: channels.uuid,
      name: channels.name,
      active: channels.active,
      messages: sql<number>`COUNT(${messages.id})`.mapWith(Number),
    })
    .from(channels)
    .leftJoin(messages, and(eq(messages.channelUuid, channels.uuid), gte(messages.receivedAt, since)))
    .groupBy(channels.uuid, channels.name, channels.active)
    .orderBy(desc(sql`COUNT(${messages.id})`))
    .limit(limit);
}

export interface EventTypeShare {
  name: string;
  value: number;
}

/** Verteilung der Event-Typen im Zeitraum. */
export async function getEventDistribution(days: number, limit = 6): Promise<EventTypeShare[]> {
  const since = daysAgo(days);

  const rows = await db
    .select({
      eventType: events.eventType,
      total: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(events)
    .where(gte(events.occurredAt, since))
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

export async function getRecentEvents(limit = 8): Promise<RecentEvent[]> {
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

export async function getRecentModeration(limit = 8): Promise<RecentModerationAction[]> {
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
export async function getTopChatters(days: number, limit = 8): Promise<TopChatter[]> {
  const since = daysAgo(days);

  return db
    .select({
      userId: messages.userId,
      userName: messages.userName,
      displayName: sql<string | null>`MAX(${messages.displayName})`,
      messages: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(messages)
    .where(gte(messages.receivedAt, since))
    .groupBy(messages.userId, messages.userName)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit);
}

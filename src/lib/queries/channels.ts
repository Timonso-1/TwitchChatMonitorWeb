import "server-only";
import { and, count, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { channels, events, messages, moderationActions } from "@/lib/db/schema";
import { inRange } from "@/lib/queries/range-filter";
import type { ResolvedRange } from "@/lib/range";

export interface ChannelListItem {
  uuid: string;
  broadcasterId: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string | null;
  messageCount: number;
}

export interface ChannelListFilters {
  search?: string;
  status?: "all" | "active" | "inactive";
  page: number;
  pageSize: number;
}

export async function listChannels(filters: ChannelListFilters): Promise<{
  items: ChannelListItem[];
  total: number;
}> {
  const conditions: SQL[] = [];

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    const searchCondition = or(like(channels.name, pattern), like(channels.broadcasterId, pattern));
    if (searchCondition) conditions.push(searchCondition);
  }

  if (filters.status === "active") conditions.push(eq(channels.active, true));
  if (filters.status === "inactive") conditions.push(eq(channels.active, false));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db.select({ value: count() }).from(channels).where(where);

  const items = await db
    .select({
      uuid: channels.uuid,
      broadcasterId: channels.broadcasterId,
      name: channels.name,
      active: channels.active,
      createdAt: channels.createdAt,
      updatedAt: channels.updatedAt,
      createdByName: channels.createdByName,
    })
    .from(channels)
    .where(where)
    .orderBy(desc(channels.active), channels.name)
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  // Nur für die aktuelle Seite zählen – kein korreliertes COUNT(*) je Zeile.
  const uuids = items.map((item) => item.uuid);
  const countRows =
    uuids.length > 0
      ? await db
          .select({
            channelUuid: messages.channelUuid,
            messageCount: count(),
          })
          .from(messages)
          .where(inArray(messages.channelUuid, uuids))
          .groupBy(messages.channelUuid)
      : [];

  const countByUuid = new Map(countRows.map((row) => [row.channelUuid, row.messageCount]));

  return {
    items: items.map((item) => ({
      ...item,
      messageCount: countByUuid.get(item.uuid) ?? 0,
    })),
    total: totalRow?.value ?? 0,
  };
}

export interface ChannelDetail {
  uuid: string;
  broadcasterId: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string | null;
  messageCount: number;
  eventCount: number;
  moderationCount: number;
  uniqueChatters: number;
  lastMessageAt: Date | null;
}

export async function getChannelDetail(uuid: string): Promise<ChannelDetail | null> {
  const [channel] = await db.select().from(channels).where(eq(channels.uuid, uuid)).limit(1);
  if (!channel) return null;

  // Eine Message-Aggregation statt drei getrennter Scans.
  const [messageStats, eventStats, moderationStats] = await Promise.all([
    db
      .select({
        messageCount: count(),
        uniqueChatters: sql<number>`COUNT(DISTINCT ${messages.userId})`.mapWith(Number),
        lastMessageAt: sql<Date | null>`MAX(${messages.receivedAt})`,
      })
      .from(messages)
      .where(eq(messages.channelUuid, uuid)),
    db.select({ value: count() }).from(events).where(eq(events.channelUuid, uuid)),
    db.select({ value: count() }).from(moderationActions).where(eq(moderationActions.channelUuid, uuid)),
  ]);

  return {
    uuid: channel.uuid,
    broadcasterId: channel.broadcasterId,
    name: channel.name,
    active: channel.active,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
    createdByName: channel.createdByName,
    messageCount: messageStats[0]?.messageCount ?? 0,
    eventCount: eventStats[0]?.value ?? 0,
    moderationCount: moderationStats[0]?.value ?? 0,
    uniqueChatters: messageStats[0]?.uniqueChatters ?? 0,
    lastMessageAt: messageStats[0]?.lastMessageAt ?? null,
  };
}

export interface ChannelActivityPoint {
  bucket: string;
  messages: number;
  events: number;
  moderation: number;
}

/** Verlauf eines Channels, Lücken aufgefüllt. */
export async function getChannelActivity(uuid: string, range: ResolvedRange): Promise<ChannelActivityPoint[]> {
  const format = range.hourly ? "%Y-%m-%d %H" : "%Y-%m-%d";

  const [messageRows, eventRows, moderationRows] = await Promise.all([
    db
      .select({
        day: sql<string>`DATE_FORMAT(${messages.receivedAt}, ${format})`,
        total: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(messages)
      .where(and(eq(messages.channelUuid, uuid), inRange(messages.receivedAt, range)))
      .groupBy(sql`DATE_FORMAT(${messages.receivedAt}, ${format})`),

    db
      .select({
        day: sql<string>`DATE_FORMAT(${events.occurredAt}, ${format})`,
        total: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(events)
      .where(and(eq(events.channelUuid, uuid), inRange(events.occurredAt, range)))
      .groupBy(sql`DATE_FORMAT(${events.occurredAt}, ${format})`),

    db
      .select({
        day: sql<string>`DATE_FORMAT(${moderationActions.occurredAt}, ${format})`,
        total: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(moderationActions)
      .where(and(eq(moderationActions.channelUuid, uuid), inRange(moderationActions.occurredAt, range)))
      .groupBy(sql`DATE_FORMAT(${moderationActions.occurredAt}, ${format})`),
  ]);

  const messageMap = new Map(messageRows.map((row) => [row.day, row.total]));
  const eventMap = new Map(eventRows.map((row) => [row.day, row.total]));
  const moderationMap = new Map(moderationRows.map((row) => [row.day, row.total]));

  const points: ChannelActivityPoint[] = [];
  const step = range.hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  const start = new Date(range.start);
  if (range.hourly) start.setMinutes(0, 0, 0);

  for (let time = start.getTime(); time <= range.end.getTime(); time += step) {
    const date = new Date(time);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const key = range.hourly ? `${day} ${String(date.getHours()).padStart(2, "0")}` : day;

    points.push({
      bucket: date.toISOString(),
      messages: messageMap.get(key) ?? 0,
      events: eventMap.get(key) ?? 0,
      moderation: moderationMap.get(key) ?? 0,
    });
  }

  return points;
}

export interface ChannelTopChatter {
  userId: string;
  userName: string;
  displayName: string | null;
  messages: number;
}

export async function getChannelTopChatters(
  uuid: string,
  range: ResolvedRange,
  limit = 8,
): Promise<ChannelTopChatter[]> {
  return db
    .select({
      userId: messages.userId,
      userName: messages.userName,
      displayName: sql<string | null>`MAX(${messages.displayName})`,
      messages: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(messages)
    .where(and(eq(messages.channelUuid, uuid), inRange(messages.receivedAt, range)))
    .groupBy(messages.userId, messages.userName)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit);
}

export interface ChannelBreakdown {
  name: string;
  value: number;
}

/** Verteilung der Event-Typen in einem Channel. */
export async function getChannelEventBreakdown(uuid: string, range: ResolvedRange): Promise<ChannelBreakdown[]> {
  const rows = await db
    .select({ name: events.eventType, value: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(events)
    .where(and(eq(events.channelUuid, uuid), inRange(events.occurredAt, range)))
    .groupBy(events.eventType)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(8);

  return rows;
}

/** Verteilung der Moderationsarten in einem Channel. */
export async function getChannelModerationBreakdown(uuid: string, range: ResolvedRange): Promise<ChannelBreakdown[]> {
  const rows = await db
    .select({ name: moderationActions.action, value: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(moderationActions)
    .where(and(eq(moderationActions.channelUuid, uuid), inRange(moderationActions.occurredAt, range)))
    .groupBy(moderationActions.action)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(8);

  return rows;
}

/** Stundenverteilung der Nachrichten eines Channels. */
export async function getChannelHourDistribution(uuid: string): Promise<Array<{ hour: number; messages: number }>> {
  const rows = await db
    .select({
      hour: sql<number>`HOUR(${messages.receivedAt})`.mapWith(Number),
      total: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(messages)
    .where(eq(messages.channelUuid, uuid))
    .groupBy(sql`HOUR(${messages.receivedAt})`);

  const map = new Map(rows.map((row) => [row.hour, row.total]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, messages: map.get(hour) ?? 0 }));
}

export interface ChannelOption {
  uuid: string;
  name: string;
}

/** Kompakte Channel-Liste für Filter-Dropdowns. */
export async function listChannelOptions(): Promise<ChannelOption[]> {
  return db
    .select({ uuid: channels.uuid, name: channels.name })
    .from(channels)
    .orderBy(desc(channels.active), channels.name);
}

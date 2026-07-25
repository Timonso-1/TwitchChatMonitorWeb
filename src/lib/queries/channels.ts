import "server-only";
import { and, count, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { channels, events, messages, moderationActions } from "@/lib/db/schema";

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
      messageCount: sql<number>`(SELECT COUNT(*) FROM ${messages} WHERE ${messages.channelUuid} = ${channels.uuid})`.mapWith(
        Number,
      ),
    })
    .from(channels)
    .where(where)
    .orderBy(desc(channels.active), channels.name)
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  return { items, total: totalRow?.value ?? 0 };
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

  const [messageStats, eventStats, moderationStats, chatterStats, lastMessage] = await Promise.all([
    db.select({ value: count() }).from(messages).where(eq(messages.channelUuid, uuid)),
    db.select({ value: count() }).from(events).where(eq(events.channelUuid, uuid)),
    db.select({ value: count() }).from(moderationActions).where(eq(moderationActions.channelUuid, uuid)),
    db
      .select({ value: sql<number>`COUNT(DISTINCT ${messages.userId})`.mapWith(Number) })
      .from(messages)
      .where(eq(messages.channelUuid, uuid)),
    db
      .select({ receivedAt: messages.receivedAt })
      .from(messages)
      .where(eq(messages.channelUuid, uuid))
      .orderBy(desc(messages.receivedAt))
      .limit(1),
  ]);

  return {
    uuid: channel.uuid,
    broadcasterId: channel.broadcasterId,
    name: channel.name,
    active: channel.active,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
    createdByName: channel.createdByName,
    messageCount: messageStats[0]?.value ?? 0,
    eventCount: eventStats[0]?.value ?? 0,
    moderationCount: moderationStats[0]?.value ?? 0,
    uniqueChatters: chatterStats[0]?.value ?? 0,
    lastMessageAt: lastMessage[0]?.receivedAt ?? null,
  };
}

export interface ChannelOption {
  uuid: string;
  name: string;
}

/** Kompakte Channel-Liste fuer Filter-Dropdowns. */
export async function listChannelOptions(): Promise<ChannelOption[]> {
  return db
    .select({ uuid: channels.uuid, name: channels.name })
    .from(channels)
    .orderBy(desc(channels.active), channels.name);
}

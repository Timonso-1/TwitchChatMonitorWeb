import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import type { ResolvedRange } from "@/lib/range";
import { parseEmotes } from "@/lib/twitch-tags";

/**
 * Emote-Auswertung aus dem `emotes`-Tag der Chatnachrichten.
 *
 * Achtung Performance: Der Tag lässt sich nicht sinnvoll indizieren, die
 * Auswertung passiert deshalb in JavaScript über eine begrenzte Stichprobe.
 * Alle Rückgaben nennen daher, wie viele Nachrichten tatsächlich betrachtet
 * wurden – die Zahlen sind Hochrechnungen, keine exakten Gesamtwerte.
 */

/** Obergrenze der betrachteten Nachrichten pro Auswertung. */
const SCAN_LIMIT = 20_000;

export interface EmoteStat {
  id: string;
  name: string;
  /** Wie oft das Emote insgesamt verwendet wurde. */
  uses: number;
  /** In wie vielen Nachrichten es vorkam. */
  messages: number;
  /** Wie viele verschiedene Chatter es benutzt haben. */
  users: number;
  lastUsedAt: Date;
}

export interface EmoteScanResult {
  emotes: EmoteStat[];
  /** Wie viele Nachrichten mit Emotes betrachtet wurden. */
  scanned: number;
  /** true, wenn die Obergrenze erreicht wurde und ältere Daten fehlen. */
  truncated: boolean;
  totalUses: number;
}

interface EmoteScanFilters {
  /** UUIDs des gewählten Channels – eine Twitch-ID kann mehrere haben. */
  channelUuids?: string[];
  userId?: string;
  /** Ohne Zeitraum wird der gesamte Bestand betrachtet. */
  range?: ResolvedRange;
  limit?: number;
}

/** Lädt die Rohdaten für alle folgenden Auswertungen. */
async function scanEmoteMessages(filters: EmoteScanFilters) {
  const conditions = [isNotNull(messages.emotes), ne(messages.emotes, "")];

  if (filters.channelUuids?.length) conditions.push(inArray(messages.channelUuid, filters.channelUuids));
  if (filters.userId) conditions.push(eq(messages.userId, filters.userId));

  if (filters.range) {
    conditions.push(gte(messages.receivedAt, filters.range.start), lte(messages.receivedAt, filters.range.end));
  }

  return db
    .select({
      userId: messages.userId,
      userName: messages.userName,
      displayName: messages.displayName,
      content: messages.content,
      emotes: messages.emotes,
      receivedAt: messages.receivedAt,
    })
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.receivedAt))
    .limit(SCAN_LIMIT);
}

export async function getEmoteStats(filters: EmoteScanFilters): Promise<EmoteScanResult> {
  const rows = await scanEmoteMessages(filters);

  const stats = new Map<
    string,
    { id: string; name: string; uses: number; messages: number; users: Set<string>; lastUsedAt: Date }
  >();

  let totalUses = 0;

  for (const row of rows) {
    const parsed = parseEmotes(row.emotes, row.content);

    for (const emote of parsed) {
      const existing = stats.get(emote.id);
      totalUses += emote.count;

      if (existing) {
        existing.uses += emote.count;
        existing.messages += 1;
        existing.users.add(row.userId);
        if (row.receivedAt > existing.lastUsedAt) existing.lastUsedAt = row.receivedAt;
      } else {
        stats.set(emote.id, {
          id: emote.id,
          name: emote.name,
          uses: emote.count,
          messages: 1,
          users: new Set([row.userId]),
          lastUsedAt: row.receivedAt,
        });
      }
    }
  }

  const emotes = [...stats.values()]
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      uses: entry.uses,
      messages: entry.messages,
      users: entry.users.size,
      lastUsedAt: entry.lastUsedAt,
    }))
    .sort((a, b) => b.uses - a.uses)
    .slice(0, filters.limit ?? 50);

  return {
    emotes,
    scanned: rows.length,
    truncated: rows.length >= SCAN_LIMIT,
    totalUses,
  };
}

export interface EmoteUser {
  userId: string;
  userName: string;
  displayName: string | null;
  uses: number;
}

/** Wer benutzt ein bestimmtes Emote am häufigsten? */
export async function getEmoteTopUsers(
  emoteId: string,
  filters: EmoteScanFilters,
  limit = 10,
): Promise<EmoteUser[]> {
  const rows = await scanEmoteMessages(filters);
  const users = new Map<string, EmoteUser>();

  for (const row of rows) {
    const match = parseEmotes(row.emotes, row.content).find((emote) => emote.id === emoteId);
    if (!match) continue;

    const existing = users.get(row.userId);

    if (existing) {
      existing.uses += match.count;
    } else {
      users.set(row.userId, {
        userId: row.userId,
        userName: row.userName,
        displayName: row.displayName,
        uses: match.count,
      });
    }
  }

  return [...users.values()].sort((a, b) => b.uses - a.uses).slice(0, limit);
}

export interface EmoteTimelinePoint {
  bucket: string;
  uses: number;
}

/** Verlauf der Emote-Nutzung – stundenweise bei kurzen, sonst tageweise. */
export async function getEmoteTimeline(
  filters: EmoteScanFilters & { emoteId?: string },
  range: ResolvedRange,
): Promise<EmoteTimelinePoint[]> {
  const rows = await scanEmoteMessages({ ...filters, range });
  const buckets = new Map<string, number>();

  const keyOf = (date: Date) => {
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return range.hourly ? `${day} ${String(date.getHours()).padStart(2, "0")}` : day;
  };

  for (const row of rows) {
    const parsed = parseEmotes(row.emotes, row.content);
    const uses = filters.emoteId
      ? (parsed.find((emote) => emote.id === filters.emoteId)?.count ?? 0)
      : parsed.reduce((sum, emote) => sum + emote.count, 0);

    if (uses === 0) continue;

    const key = keyOf(row.receivedAt);
    buckets.set(key, (buckets.get(key) ?? 0) + uses);
  }

  const points: EmoteTimelinePoint[] = [];
  const step = range.hourly ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  const start = new Date(range.start);
  if (range.hourly) start.setMinutes(0, 0, 0);

  for (let time = start.getTime(); time <= range.end.getTime(); time += step) {
    const date = new Date(time);
    points.push({ bucket: date.toISOString(), uses: buckets.get(keyOf(date)) ?? 0 });
  }

  return points;
}

export interface ViewerEmoteSummary {
  topEmotes: EmoteStat[];
  /** Anteil der Nachrichten mit mindestens einem Emote. */
  messagesWithEmotes: number;
  scanned: number;
}

/** Emote-Nutzung eines einzelnen Chatters – für das Profil. */
export async function getViewerEmoteSummary(userId: string, limit = 8): Promise<ViewerEmoteSummary> {
  const result = await getEmoteStats({ userId, limit });

  return {
    topEmotes: result.emotes,
    messagesWithEmotes: result.scanned,
    scanned: result.scanned,
  };
}

/**
 * Gesamtzahl der Nachrichten im Bezugsrahmen – nötig, um den Anteil
 * der Nachrichten mit Emotes einordnen zu können.
 */
export async function countMessagesForScope(filters: EmoteScanFilters): Promise<number> {
  const conditions = [];

  if (filters.channelUuids?.length) conditions.push(inArray(messages.channelUuid, filters.channelUuids));
  if (filters.userId) conditions.push(eq(messages.userId, filters.userId));
  if (filters.range) {
    conditions.push(gte(messages.receivedAt, filters.range.start), lte(messages.receivedAt, filters.range.end));
  }

  const [row] = await db
    .select({ value: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(messages)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return row?.value ?? 0;
}

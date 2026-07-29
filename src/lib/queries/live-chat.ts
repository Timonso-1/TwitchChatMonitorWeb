import "server-only";

import { and, desc, eq, gt, inArray, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, moderationActions } from "@/lib/db/schema";
import type { BadgeImage, BadgeSet } from "@/lib/twitch-api";
import { getCachedBadgeSets, getCachedViewerAvatars } from "@/lib/twitch-api";
import { getActiveWatchTerms } from "@/lib/queries/watchlist";
import { parseBadges } from "@/lib/twitch-tags";
import { findMatches } from "@/lib/watchlist";
import type { LiveAvatar, LiveChatPayload, LiveMessage, LiveReplyTarget } from "@/lib/live-chat-feed";

/** Obergrenze für nachgereichte Löschungen pro Abruf. */
const MAX_DELETIONS = 200;

export interface LiveChatQuery {
  /** UUIDs des gewählten Channels – eine Twitch-ID kann mehrere haben. */
  channelUuids?: string[];
  /** Cursor auf messages.id; 0 lädt den aktuellen Verlauf. */
  afterId: number;
  /** Cursor auf moderation_actions.id; 0 bedeutet Erstabruf. */
  modAfter: number;
  limit: number;
}

/**
 * Lädt neue Chatnachrichten samt allem, was die Anzeige dafür braucht.
 *
 * Avatare, Abzeichenbilder und Antwortziele kommen dedupliziert als
 * Wörterbücher zurück – der Client führt sie über Abrufe hinweg mit, sodass
 * dieselben Bilder nicht bei jedem Poll erneut über die Leitung gehen.
 */
export async function loadLiveChat(query: LiveChatQuery): Promise<LiveChatPayload> {
  const conditions: SQL[] = [];
  if (query.channelUuids?.length) conditions.push(inArray(messages.channelUuid, query.channelUuids));
  if (Number.isFinite(query.afterId) && query.afterId > 0) conditions.push(gt(messages.id, query.afterId));

  const rows = await db
    .select({
      id: messages.id,
      channelUuid: messages.channelUuid,
      channelId: messages.channelId,
      channelName: messages.channelName,
      userId: messages.userId,
      userName: messages.userName,
      displayName: messages.displayName,
      color: messages.color,
      content: messages.content,
      bits: messages.bits,
      isMod: messages.isMod,
      isSubscriber: messages.isSubscriber,
      isVip: messages.isVip,
      isBroadcaster: messages.isBroadcaster,
      isFirstMessage: messages.isFirstMessage,
      isAction: messages.isAction,
      badges: messages.badges,
      badgeInfo: messages.badgeInfo,
      messageId: messages.messageId,
      replyToMessageId: messages.replyToMessageId,
      receivedAt: messages.receivedAt,
    })
    .from(messages)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(messages.id))
    .limit(query.limit);

  const terms = await getActiveWatchTerms();

  // Älteste zuerst, damit die Liste chronologisch wächst.
  const ordered: LiveMessage[] = rows.reverse().map((row) => ({
    ...row,
    receivedAt: row.receivedAt.toISOString(),
    matches: findMatches(row.content, terms, row.channelUuid),
  }));

  const [avatarMap, badgeSetMap, deletions, replyTargets] = await Promise.all([
    getCachedViewerAvatars(ordered.map((entry) => entry.userId)),
    getCachedBadgeSets(ordered.map((entry) => entry.channelId)),
    loadDeletions(ordered, query.modAfter),
    loadReplyTargets(ordered),
  ]);

  const avatars: Record<string, LiveAvatar> = {};
  for (const [userId, entry] of avatarMap) {
    avatars[userId] = { profileImageUrl: entry.profileImageUrl, displayName: entry.displayName };
  }

  return {
    messages: ordered,
    latestId: ordered.length > 0 ? ordered[ordered.length - 1].id : query.afterId,
    modCursor: deletions.cursor,
    deletedIds: deletions.ids,
    avatars,
    badgeImages: usedBadgeImages(ordered, badgeSetMap),
    replyTargets,
  };
}

/**
 * Reduziert die Abzeichensätze auf die Bilder, die dieser Stapel wirklich
 * benutzt. Ein kompletter Satz enthält alle globalen Abzeichen und wäre pro
 * Abruf um Größenordnungen zu schwer.
 */
function usedBadgeImages(
  items: LiveMessage[],
  sets: Map<string, BadgeSet>,
): Record<string, Record<string, Record<string, BadgeImage>>> {
  const result: Record<string, Record<string, Record<string, BadgeImage>>> = {};

  for (const message of items) {
    const set = sets.get(message.channelId);
    if (!set) continue;

    for (const badge of parseBadges(message.badges, message.badgeInfo)) {
      const image = set.get(badge.name)?.get(badge.version);
      if (!image) continue;

      const names = (result[message.channelId] ??= {});
      const versions = (names[badge.name] ??= {});
      versions[badge.version] = image;
    }
  }

  return result;
}

/**
 * Löschungen für diesen Abruf.
 *
 * Beim Erstabruf (modAfter <= 0) nur die des aktuellen Stapels – sonst käme
 * die gesamte Historie zurück. Danach inkrementell über den Cursor, sodass
 * auch Nachrichten markiert werden, die längst im Client-Puffer liegen.
 */
async function loadDeletions(
  items: LiveMessage[],
  modAfter: number,
): Promise<{ ids: string[]; cursor: number }> {
  if (!Number.isFinite(modAfter) || modAfter <= 0) {
    const messageIds = items.map((entry) => entry.messageId).filter(Boolean);

    const [deleted, head] = await Promise.all([
      messageIds.length > 0
        ? db
            .select({ deletedMessageId: moderationActions.deletedMessageId })
            .from(moderationActions)
            .where(inArray(moderationActions.deletedMessageId, messageIds))
        : Promise.resolve([]),

      db.select({ id: moderationActions.id }).from(moderationActions).orderBy(desc(moderationActions.id)).limit(1),
    ]);

    return {
      ids: deleted.map((row) => row.deletedMessageId).filter((id): id is string => Boolean(id)),
      cursor: head[0]?.id ?? 0,
    };
  }

  const rows = await db
    .select({ id: moderationActions.id, deletedMessageId: moderationActions.deletedMessageId })
    .from(moderationActions)
    .where(gt(moderationActions.id, modAfter))
    .orderBy(moderationActions.id)
    .limit(MAX_DELETIONS);

  return {
    ids: rows.map((row) => row.deletedMessageId).filter((id): id is string => Boolean(id)),
    // Bei mehr als MAX_DELETIONS rückt der Cursor nur bis hierher – der
    // nächste Abruf holt den Rest nach, es geht nichts verloren.
    cursor: rows.length > 0 ? rows[rows.length - 1].id : modAfter,
  };
}

async function loadReplyTargets(items: LiveMessage[]): Promise<Record<string, LiveReplyTarget>> {
  const replyIds = [
    ...new Set(items.map((entry) => entry.replyToMessageId).filter((id): id is string => Boolean(id))),
  ];

  if (replyIds.length === 0) return {};

  const targets = await db
    .select({
      messageId: messages.messageId,
      userName: messages.userName,
      displayName: messages.displayName,
      content: messages.content,
    })
    .from(messages)
    .where(inArray(messages.messageId, replyIds));

  const result: Record<string, LiveReplyTarget> = {};
  for (const row of targets) {
    result[row.messageId] = { userName: row.displayName ?? row.userName, content: row.content };
  }

  return result;
}

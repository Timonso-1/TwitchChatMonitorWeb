import "server-only";

import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, moderationActions } from "@/lib/db/schema";
import type { BadgeImage } from "@/lib/twitch-api";
import { getCachedBadgeSets, getCachedViewerAvatars } from "@/lib/twitch-api";
import { getConversation } from "@/lib/queries/twitch";
import { getActiveWatchTerms } from "@/lib/queries/watchlist";
import { parseBadges } from "@/lib/twitch-tags";
import { findMatches } from "@/lib/watchlist";
import { SURROUNDING_MAX, type MessageDetailPayload, type SurroundingMessage } from "@/lib/message-detail";

/**
 * Alles, was der Detaildialog zu einer Nachricht zeigt.
 *
 * Der Auslöser in der Tabelle kennt nur die messageId – deshalb wird hier
 * auch das wiederholt, was die Zeile schon hatte. Das kostet eine Abfrage
 * pro Öffnen und erspart es, ein Dutzend Felder durch Props zu schleifen.
 */
export async function loadMessageDetail(messageId: string): Promise<MessageDetailPayload | null> {
  const [row] = await db
    .select({
      id: messages.id,
      messageId: messages.messageId,
      channelUuid: messages.channelUuid,
      channelId: messages.channelId,
      channelName: messages.channelName,
      userId: messages.userId,
      userName: messages.userName,
      displayName: messages.displayName,
      color: messages.color,
      content: messages.content,
      emotes: messages.emotes,
      badges: messages.badges,
      badgeInfo: messages.badgeInfo,
      bits: messages.bits,
      isAction: messages.isAction,
      isFirstMessage: messages.isFirstMessage,
      isBroadcaster: messages.isBroadcaster,
      isMod: messages.isMod,
      isVip: messages.isVip,
      isSubscriber: messages.isSubscriber,
      receivedAt: messages.receivedAt,
      replyToMessageId: messages.replyToMessageId,
    })
    .from(messages)
    .where(eq(messages.messageId, messageId))
    .limit(1);

  if (!row) return null;

  const [terms, avatarMap, badgeSetMap, conversation, surrounding, deletionRows] = await Promise.all([
    getActiveWatchTerms(),
    getCachedViewerAvatars([row.userId]),
    getCachedBadgeSets([row.channelId]),
    getConversation(messageId),
    getSurroundingMessages(row.channelUuid, row.id),

    db
      .select({ reason: moderationActions.reason, occurredAt: moderationActions.occurredAt })
      .from(moderationActions)
      .where(eq(moderationActions.deletedMessageId, messageId))
      .orderBy(desc(moderationActions.id))
      .limit(1),
  ]);

  const avatar = avatarMap.get(row.userId);
  const deletion = deletionRows[0];

  // channelUuid gehört nicht in die Antwort: der Dialog braucht ihn nicht,
  // aber findMatches muss channelgebundene Begriffe damit auswerten.
  const { channelUuid, ...message } = row;

  return {
    message: {
      ...message,
      receivedAt: row.receivedAt.toISOString(),
      matches: findMatches(row.content, terms, channelUuid),
      badgeImages: badgeImagesFor(row.badges, row.badgeInfo, badgeSetMap.get(row.channelId)),
      avatar: avatar
        ? { profileImageUrl: avatar.profileImageUrl, displayName: avatar.displayName }
        : null,
    },
    conversation: conversation.map((entry) => ({
      ...entry,
      receivedAt: entry.receivedAt.toISOString(),
    })),
    deletion: deletion
      ? { reason: deletion.reason, occurredAt: deletion.occurredAt.toISOString() }
      : null,
    surrounding,
  };
}

/**
 * Die zeitliche Umgebung einer Nachricht im selben Channel.
 *
 * Anders als `getConversation` geht es hier nicht um Antwortbezüge, sondern um
 * den Chatverlauf drumherum: was unmittelbar davor und danach geschrieben wurde,
 * unabhängig davon, ob es Antworten sind oder später gelöscht wurden.
 *
 * Sortiert und begrenzt wird über `messages.id` statt über `received_at`: die
 * Spalte ist eindeutig, sodass Nachrichten innerhalb derselben Sekunde eine
 * stabile Reihenfolge behalten. Beide Abfragen laufen über den vorhandenen
 * Index `idx_messages_channel_id (channel_uuid, id)` als reiner Bereichsscan.
 */
async function getSurroundingMessages(
  channelUuid: string,
  id: number,
): Promise<{ before: SurroundingMessage[]; after: SurroundingMessage[] }> {
  const columns = {
    id: messages.id,
    messageId: messages.messageId,
    userId: messages.userId,
    userName: messages.userName,
    displayName: messages.displayName,
    color: messages.color,
    content: messages.content,
    receivedAt: messages.receivedAt,
  };

  const [olderRows, newerRows] = await Promise.all([
    db
      .select(columns)
      .from(messages)
      .where(and(eq(messages.channelUuid, channelUuid), lt(messages.id, id)))
      .orderBy(desc(messages.id))
      .limit(SURROUNDING_MAX),

    db
      .select(columns)
      .from(messages)
      .where(and(eq(messages.channelUuid, channelUuid), gt(messages.id, id)))
      .orderBy(asc(messages.id))
      .limit(SURROUNDING_MAX),
  ]);

  // Absteigend geholt, damit das Limit die naechstgelegenen trifft – fuer die
  // Anzeige muss es wieder chronologisch sein.
  const older = olderRows.reverse();

  const deleted = await deletedMessageIds([...older, ...newerRows].map((row) => row.messageId));

  const toEntry = (row: (typeof olderRows)[number]): SurroundingMessage => ({
    ...row,
    receivedAt: row.receivedAt.toISOString(),
    deleted: deleted.has(row.messageId),
  });

  return { before: older.map(toEntry), after: newerRows.map(toEntry) };
}

/** Welche dieser Nachrichten spaeter von der Moderation entfernt wurden. */
async function deletedMessageIds(messageIds: string[]): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();

  const rows = await db
    .select({ deletedMessageId: moderationActions.deletedMessageId })
    .from(moderationActions)
    .where(inArray(moderationActions.deletedMessageId, messageIds));

  return new Set(rows.map((row) => row.deletedMessageId).filter((value): value is string => Boolean(value)));
}

/** Nur die Abzeichenbilder dieser einen Nachricht – nicht der ganze Satz. */
function badgeImagesFor(
  badges: string | null,
  badgeInfo: string | null,
  set: Map<string, Map<string, BadgeImage>> | undefined,
): Record<string, Record<string, BadgeImage>> {
  if (!set) return {};

  const result: Record<string, Record<string, BadgeImage>> = {};

  for (const badge of parseBadges(badges, badgeInfo)) {
    const image = set.get(badge.name)?.get(badge.version);
    if (!image) continue;

    const versions = (result[badge.name] ??= {});
    versions[badge.version] = image;
  }

  return result;
}

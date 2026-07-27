import "server-only";

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, moderationActions } from "@/lib/db/schema";
import type { BadgeImage } from "@/lib/twitch-api";
import { getCachedBadgeSets, getCachedViewerAvatars } from "@/lib/twitch-api";
import { getConversation } from "@/lib/queries/twitch";
import { getActiveWatchTerms } from "@/lib/queries/watchlist";
import { parseBadges } from "@/lib/twitch-tags";
import { findMatches } from "@/lib/watchlist";
import type { MessageDetailPayload } from "@/lib/message-detail";

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

  const [terms, avatarMap, badgeSetMap, conversation, deletionRows] = await Promise.all([
    getActiveWatchTerms(),
    getCachedViewerAvatars([row.userId]),
    getCachedBadgeSets([row.channelId]),
    getConversation(messageId),

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
  };
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

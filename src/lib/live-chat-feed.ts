/**
 * Zustand und Mischlogik des Live-Chat-Stroms.
 *
 * Bewusst frei von Server- und React-Abhängigkeiten: die Route liefert
 * JSON-Records, der Client führt daraus Maps mit. Beides trifft sich hier,
 * damit die Logik ohne DOM und ohne Datenbank prüfbar bleibt.
 */

import type { BadgeImage, BadgeSet } from "@/lib/twitch-api";
import type { TermMatch } from "@/lib/watchlist";

export interface LiveMessage {
  id: number;
  channelUuid: string;
  channelId: string;
  channelName: string;
  userId: string;
  userName: string;
  displayName: string | null;
  color: string | null;
  content: string;
  bits: number;
  isMod: boolean;
  isSubscriber: boolean;
  isVip: boolean;
  isBroadcaster: boolean;
  isFirstMessage: boolean;
  isAction: boolean;
  badges: string | null;
  badgeInfo: string | null;
  messageId: string;
  replyToMessageId: string | null;
  receivedAt: string;
  matches: TermMatch[];
}

export interface LiveAvatar {
  profileImageUrl: string | null;
  displayName: string | null;
}

export interface LiveReplyTarget {
  userName: string;
  content: string;
}

/** Antwort von /api/live-chat – reine Records, damit sie durch JSON passen. */
export interface LiveChatPayload {
  messages: LiveMessage[];
  latestId: number;
  /** Höchste gesehene moderation_actions.id. */
  modCursor: number;
  deletedIds: string[];
  avatars: Record<string, LiveAvatar>;
  /** channelId -> Abzeichenname -> Version -> Bild. */
  badgeImages: Record<string, Record<string, Record<string, BadgeImage>>>;
  replyTargets: Record<string, LiveReplyTarget>;
}

export interface FeedState {
  messages: LiveMessage[];
  avatars: Map<string, LiveAvatar>;
  /** Genau die Form, die ChatBadges über seine set-Prop erwartet. */
  badgeSets: Map<string, BadgeSet>;
  replyTargets: Map<string, LiveReplyTarget>;
  deletedIds: Set<string>;
}

export interface MergeResult {
  state: FeedState;
  /** Wie viele Nachrichten wirklich neu hinzugekommen sind. */
  added: number;
}

export function emptyFeedState(): FeedState {
  return {
    messages: [],
    avatars: new Map(),
    badgeSets: new Map(),
    replyTargets: new Map(),
    deletedIds: new Set(),
  };
}

/**
 * Mischt einen Stapel in den Zustand.
 *
 * Gibt denselben Zustand zurück, wenn der Stapel nichts beiträgt – sonst
 * würde jeder Abruf ein Neuzeichnen auslösen, auch wenn der Chat still ist.
 */
export function mergeBatch(state: FeedState, payload: LiveChatPayload, maxMessages: number): MergeResult {
  const known = new Set(state.messages.map((entry) => entry.id));
  const fresh = payload.messages.filter((entry) => !known.has(entry.id));

  const hasDictionaryUpdate =
    payload.deletedIds.length > 0 ||
    Object.keys(payload.avatars).length > 0 ||
    Object.keys(payload.badgeImages).length > 0 ||
    Object.keys(payload.replyTargets).length > 0;

  if (fresh.length === 0 && !hasDictionaryUpdate) {
    return { state, added: 0 };
  }

  const merged = [...state.messages, ...fresh];
  const messages = merged.length > maxMessages ? merged.slice(merged.length - maxMessages) : merged;

  const avatars = new Map(state.avatars);
  for (const [userId, avatar] of Object.entries(payload.avatars)) {
    avatars.set(userId, avatar);
  }

  const replyTargets = new Map(state.replyTargets);
  for (const [messageId, target] of Object.entries(payload.replyTargets)) {
    replyTargets.set(messageId, target);
  }

  const deletedIds = new Set(state.deletedIds);
  for (const messageId of payload.deletedIds) {
    deletedIds.add(messageId);
  }

  return {
    state: {
      messages,
      avatars,
      badgeSets: mergeBadgeImages(state.badgeSets, payload.badgeImages),
      // Nach messageId verschlüsselt: wächst sonst linear mit der Laufzeit.
      replyTargets: pruneReplyTargets(replyTargets, messages),
      deletedIds: pruneDeletedIds(deletedIds, messages),
    },
    added: fresh.length,
  };
}

/** Verschachtelte Records aus dem JSON in die Map-Form von ChatBadges überführen. */
function mergeBadgeImages(
  existing: Map<string, BadgeSet>,
  incoming: Record<string, Record<string, Record<string, BadgeImage>>>,
): Map<string, BadgeSet> {
  if (Object.keys(incoming).length === 0) return existing;

  const result = new Map(existing);

  for (const [channelId, names] of Object.entries(incoming)) {
    const channelSet: BadgeSet = new Map(result.get(channelId));

    for (const [name, versions] of Object.entries(names)) {
      const versionMap = new Map(channelSet.get(name));

      for (const [version, image] of Object.entries(versions)) {
        versionMap.set(version, image);
      }

      channelSet.set(name, versionMap);
    }

    result.set(channelId, channelSet);
  }

  return result;
}

function pruneDeletedIds(deletedIds: Set<string>, messages: LiveMessage[]): Set<string> {
  const alive = new Set(messages.map((entry) => entry.messageId));
  const result = new Set<string>();

  for (const messageId of deletedIds) {
    if (alive.has(messageId)) result.add(messageId);
  }

  return result;
}

function pruneReplyTargets(
  replyTargets: Map<string, LiveReplyTarget>,
  messages: LiveMessage[],
): Map<string, LiveReplyTarget> {
  const referenced = new Set(
    messages.map((entry) => entry.replyToMessageId).filter((id): id is string => Boolean(id)),
  );

  const result = new Map<string, LiveReplyTarget>();

  for (const [messageId, target] of replyTargets) {
    if (referenced.has(messageId)) result.set(messageId, target);
  }

  return result;
}

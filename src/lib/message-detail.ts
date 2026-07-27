/**
 * Vertrag des Nachrichten-Detaildialogs.
 *
 * Bewusst frei von Server- und React-Abhängigkeiten: die Route liefert
 * JSON-Records, der Dialog rendert daraus. Beides trifft sich hier, damit
 * die Umwandlung ohne DOM und ohne Datenbank prüfbar bleibt.
 */

import type { BadgeImage, BadgeSet } from "@/lib/twitch-api";
import type { TermMatch } from "@/lib/watchlist";

export interface MessageDetailAvatar {
  profileImageUrl: string | null;
  displayName: string | null;
}

export interface MessageDetailMessage {
  id: number;
  messageId: string;
  channelId: string;
  channelName: string;
  userId: string;
  userName: string;
  displayName: string | null;
  color: string | null;
  content: string;
  emotes: string | null;
  badges: string | null;
  badgeInfo: string | null;
  bits: number;
  isAction: boolean;
  isFirstMessage: boolean;
  isBroadcaster: boolean;
  isMod: boolean;
  isVip: boolean;
  isSubscriber: boolean;
  receivedAt: string;
  replyToMessageId: string | null;
  matches: TermMatch[];
  /** Abzeichenname -> Version -> Bild, nur für diese eine Nachricht. */
  badgeImages: Record<string, Record<string, BadgeImage>>;
  avatar: MessageDetailAvatar | null;
}

export interface ConversationMessage {
  id: number;
  messageId: string;
  userId: string;
  userName: string;
  displayName: string | null;
  color: string | null;
  content: string;
  receivedAt: string;
  /** Ist das die Ursprungsnachricht der Kette? */
  isRoot: boolean;
}

export interface MessageDeletion {
  reason: string | null;
  occurredAt: string;
}

export interface MessageDetailPayload {
  message: MessageDetailMessage;
  conversation: ConversationMessage[];
  deletion: MessageDeletion | null;
}

/**
 * Verschachteltes Record in die Map-Form überführen, die ChatBadges über
 * seine set-Prop erwartet.
 *
 * Object.entries liest ausschliesslich eigene Schlüssel – ein per JSON.parse
 * erzeugtes "__proto__" wird damit zu einem normalen Namen und schleppt
 * nichts aus der Prototypenkette ein.
 */
export function toBadgeSet(images: Record<string, Record<string, BadgeImage>>): BadgeSet {
  const result: BadgeSet = new Map();

  for (const [name, versions] of Object.entries(images)) {
    result.set(name, new Map(Object.entries(versions)));
  }

  return result;
}

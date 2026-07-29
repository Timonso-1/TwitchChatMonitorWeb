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

/** Eine Nachricht aus der zeitlichen Umgebung, unabhängig von Antwortbezügen. */
export interface SurroundingMessage {
  id: number;
  messageId: string;
  userId: string;
  userName: string;
  displayName: string | null;
  color: string | null;
  content: string;
  receivedAt: string;
  /** Wurde später von der Moderation entfernt. */
  deleted: boolean;
}

/**
 * Obergrenze je Richtung.
 *
 * Der Server liefert immer diese Zahl, der Regler im Dialog schneidet daraus
 * zu. So kostet das Verstellen keine weitere Abfrage – bei der Latenz zur
 * Datenbank würde sonst jeder Reglerschritt spürbar hängen.
 */
export const SURROUNDING_MAX = 25;

/** Voreinstellung des Reglers. */
export const SURROUNDING_DEFAULT = 5;

export interface MessageDetailPayload {
  message: MessageDetailMessage;
  conversation: ConversationMessage[];
  deletion: MessageDeletion | null;
  /** Bis zu SURROUNDING_MAX je Richtung, aus demselben Channel, nach Zeit sortiert. */
  surrounding: { before: SurroundingMessage[]; after: SurroundingMessage[] };
}

export interface SlicedSurrounding {
  before: SurroundingMessage[];
  after: SurroundingMessage[];
  /** Es gibt keine älteren Nachrichten mehr als die gezeigten. */
  atStart: boolean;
  /** Es gibt keine neueren Nachrichten mehr als die gezeigten. */
  atEnd: boolean;
}

/**
 * Schneidet die vom Server gelieferte Umgebung auf die eingestellte Größe zu.
 *
 * `before` kommt chronologisch, die dem Ereignis nächsten Einträge stehen also
 * hinten – deshalb wird von hinten geschnitten. Der Startindex muss dabei bei 0
 * abgefangen werden: liegen weniger Nachrichten vor als gewünscht, würde ein
 * negativer Index nur die letzten davon liefern statt aller.
 */
export function sliceSurrounding(
  surrounding: MessageDetailPayload["surrounding"],
  size: number,
): SlicedSurrounding {
  return {
    before: surrounding.before.slice(Math.max(0, surrounding.before.length - size)),
    after: surrounding.after.slice(0, size),
    atStart: surrounding.before.length < size,
    atEnd: surrounding.after.length < size,
  };
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

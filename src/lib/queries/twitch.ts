import "server-only";
import { and, count, desc, eq, gte, inArray, like, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, messages, moderationActions, viewers } from "@/lib/db/schema";
import { roleFilterBadge } from "@/lib/twitch-tags";

/** Wandelt einen Datums-String aus einem Formular in ein Date um. */
function parseDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const date = new Date(endOfDay ? `${value}T23:59:59.999` : `${value}T00:00:00.000`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// ---------------------------------------------------------------------------
// Nachrichten
// ---------------------------------------------------------------------------

export interface MessageFilters {
  /** UUIDs des gewählten Channels – eine Twitch-ID kann mehrere haben. */
  channelUuids?: string[];
  user?: string;
  content?: string;
  /** Rolle oder Abzeichen – siehe MESSAGE_ROLE_FILTERS. */
  role?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface MessageListItem {
  id: number;
  messageId: string;
  channelName: string;
  /** Broadcaster-ID des Channels – nötig für die kanaleigenen Abzeichen. */
  channelId: string;
  userId: string;
  userName: string;
  displayName: string | null;
  color: string | null;
  content: string;
  emotes: string | null;
  /** Roher `badges`-Tag, z. B. "moderator/1,subscriber/12". */
  badges: string | null;
  badgeInfo: string | null;
  replyToMessageId: string | null;
  bits: number;
  isMod: boolean;
  isSubscriber: boolean;
  isVip: boolean;
  isBroadcaster: boolean;
  isFirstMessage: boolean;
  isAction: boolean;
  receivedAt: Date;
}

function buildMessageConditions(filters: MessageFilters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.channelUuids?.length) conditions.push(inArray(messages.channelUuid, filters.channelUuids));

  if (filters.user) {
    const pattern = `%${filters.user}%`;
    const condition = or(like(messages.userName, pattern), like(messages.displayName, pattern));
    if (condition) conditions.push(condition);
  }

  if (filters.content) conditions.push(like(messages.content, `%${filters.content}%`));

  const badge = filters.role ? roleFilterBadge(filters.role) : null;

  if (badge) {
    // Der rohe Tag sieht aus wie "moderator/1,subscriber/12". Die
    // Wortgrenze verhindert, dass "founder" auch in "cofounder" trifft.
    conditions.push(sql`${messages.badges} REGEXP ${`(^|,)${badge}/`}`);
  } else {
    switch (filters.role) {
      case "mod":
        conditions.push(eq(messages.isMod, true));
        break;
      case "subscriber":
        conditions.push(eq(messages.isSubscriber, true));
        break;
      case "vip":
        conditions.push(eq(messages.isVip, true));
        break;
      case "broadcaster":
        conditions.push(eq(messages.isBroadcaster, true));
        break;
      case "first":
        conditions.push(eq(messages.isFirstMessage, true));
        break;
      default:
        break;
    }
  }

  const from = parseDate(filters.from);
  const to = parseDate(filters.to, true);
  if (from) conditions.push(gte(messages.receivedAt, from));
  if (to) conditions.push(lte(messages.receivedAt, to));

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function listMessages(filters: MessageFilters): Promise<{
  items: MessageListItem[];
  total: number;
}> {
  const where = buildMessageConditions(filters);

  const [totalRow] = await db.select({ value: count() }).from(messages).where(where);

  const items = await db
    .select({
      id: messages.id,
      messageId: messages.messageId,
      channelName: messages.channelName,
      channelId: messages.channelId,
      userId: messages.userId,
      userName: messages.userName,
      displayName: messages.displayName,
      color: messages.color,
      content: messages.content,
      emotes: messages.emotes,
      badges: messages.badges,
      badgeInfo: messages.badgeInfo,
      replyToMessageId: messages.replyToMessageId,
      bits: messages.bits,
      isMod: messages.isMod,
      isSubscriber: messages.isSubscriber,
      isVip: messages.isVip,
      isBroadcaster: messages.isBroadcaster,
      isFirstMessage: messages.isFirstMessage,
      isAction: messages.isAction,
      receivedAt: messages.receivedAt,
    })
    .from(messages)
    .where(where)
    .orderBy(desc(messages.receivedAt), desc(messages.id))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  return { items, total: totalRow?.value ?? 0 };
}

export interface MessageContext {
  /** Nachrichten-IDs, zu denen eine Löschung vorliegt. */
  deletedIds: Set<string>;
  /** Ursprungsnachrichten zu Antworten: message_id → Vorschau. */
  replyTargets: Map<string, { userName: string; content: string }>;
}

/**
 * Ergänzt eine Nachrichtenliste um Zusatzinformationen aus anderen Tabellen:
 * welche Nachrichten gelöscht wurden und worauf Antworten sich beziehen.
 *
 * Bewusst als separate Abfrage statt als JOIN – so bleibt die Hauptabfrage
 * schlank und die Zusatzinfos lassen sich bei Bedarf weglassen.
 */
/** Nur die Felder, die Kontextabfragen wirklich brauchen. */
export type MessageContextItem = Pick<MessageListItem, "messageId" | "replyToMessageId">;

export async function getMessageContext(items: MessageContextItem[]): Promise<MessageContext> {
  const messageIds = items.map((item) => item.messageId).filter(Boolean);
  const replyIds = items.map((item) => item.replyToMessageId).filter((id): id is string => Boolean(id));

  const [deletions, targets] = await Promise.all([
    messageIds.length > 0
      ? db
          .select({ deletedMessageId: moderationActions.deletedMessageId })
          .from(moderationActions)
          .where(inArray(moderationActions.deletedMessageId, messageIds))
      : Promise.resolve([]),

    replyIds.length > 0
      ? db
          .select({
            messageId: messages.messageId,
            userName: messages.userName,
            displayName: messages.displayName,
            content: messages.content,
          })
          .from(messages)
          .where(inArray(messages.messageId, replyIds))
      : Promise.resolve([]),
  ]);

  return {
    deletedIds: new Set(deletions.map((row) => row.deletedMessageId).filter((id): id is string => Boolean(id))),
    replyTargets: new Map(
      targets.map((row) => [
        row.messageId,
        { userName: row.displayName ?? row.userName, content: row.content },
      ]),
    ),
  };
}

export interface ConversationEntry {
  id: number;
  messageId: string;
  userId: string;
  userName: string;
  displayName: string | null;
  color: string | null;
  content: string;
  receivedAt: Date;
  /** Ist das die Ursprungsnachricht der Kette? */
  isRoot: boolean;
}

/**
 * Lädt eine Antwortkette: die Ursprungsnachricht und alle direkten Antworten.
 * Twitch verweist immer auf die ursprüngliche Nachricht, nicht auf die
 * jeweils vorherige Antwort – die Kette ist also flach.
 */
export async function getConversation(messageId: string): Promise<ConversationEntry[]> {
  const [root] = await db
    .select({
      id: messages.id,
      messageId: messages.messageId,
      userId: messages.userId,
      userName: messages.userName,
      displayName: messages.displayName,
      color: messages.color,
      content: messages.content,
      receivedAt: messages.receivedAt,
      replyToMessageId: messages.replyToMessageId,
    })
    .from(messages)
    .where(eq(messages.messageId, messageId))
    .limit(1);

  if (!root) return [];

  // Wenn die Nachricht selbst eine Antwort ist, wird die Wurzel gesucht.
  const rootId = root.replyToMessageId ?? root.messageId;

  const [rootMessage, replies] = await Promise.all([
    root.replyToMessageId
      ? db
          .select({
            id: messages.id,
            messageId: messages.messageId,
            userId: messages.userId,
            userName: messages.userName,
            displayName: messages.displayName,
            color: messages.color,
            content: messages.content,
            receivedAt: messages.receivedAt,
          })
          .from(messages)
          .where(eq(messages.messageId, rootId))
          .limit(1)
      : Promise.resolve([root]),

    db
      .select({
        id: messages.id,
        messageId: messages.messageId,
        userId: messages.userId,
        userName: messages.userName,
        displayName: messages.displayName,
        color: messages.color,
        content: messages.content,
        receivedAt: messages.receivedAt,
      })
      .from(messages)
      .where(eq(messages.replyToMessageId, rootId))
      .orderBy(messages.receivedAt)
      .limit(50),
  ]);

  const entries: ConversationEntry[] = [];

  if (rootMessage[0]) {
    entries.push({ ...rootMessage[0], isRoot: true });
  }

  entries.push(...replies.map((reply) => ({ ...reply, isRoot: false })));

  return entries;
}

/** Liefert Nachrichten für den CSV-Export (ohne Pagination, mit hartem Limit). */
export async function exportMessages(filters: Omit<MessageFilters, "page" | "pageSize">, limit = 10_000) {
  const where = buildMessageConditions({ ...filters, page: 1, pageSize: limit });

  return db
    .select({
      receivedAt: messages.receivedAt,
      channelName: messages.channelName,
      userName: messages.userName,
      displayName: messages.displayName,
      isMod: messages.isMod,
      isSubscriber: messages.isSubscriber,
      isVip: messages.isVip,
      bits: messages.bits,
      content: messages.content,
    })
    .from(messages)
    .where(where)
    .orderBy(desc(messages.receivedAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface EventFilters {
  /** UUIDs des gewählten Channels – eine Twitch-ID kann mehrere haben. */
  channelUuids?: string[];
  eventType?: string;
  user?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface EventListItem {
  id: number;
  channelName: string;
  eventType: string;
  userId: string | null;
  userName: string | null;
  giftedByName: string | null;
  subTier: string | null;
  months: number | null;
  giftCount: number | null;
  viewerCount: number | null;
  message: string | null;
  occurredAt: Date;
}

export async function listEvents(filters: EventFilters): Promise<{ items: EventListItem[]; total: number }> {
  const conditions: SQL[] = [];

  if (filters.channelUuids?.length) conditions.push(inArray(events.channelUuid, filters.channelUuids));
  if (filters.eventType) conditions.push(eq(events.eventType, filters.eventType));
  if (filters.user) conditions.push(like(events.userName, `%${filters.user}%`));

  const from = parseDate(filters.from);
  const to = parseDate(filters.to, true);
  if (from) conditions.push(gte(events.occurredAt, from));
  if (to) conditions.push(lte(events.occurredAt, to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db.select({ value: count() }).from(events).where(where);

  const items = await db
    .select({
      id: events.id,
      channelName: events.channelName,
      eventType: events.eventType,
      userId: events.userId,
      userName: events.userName,
      giftedByName: events.giftedByName,
      subTier: events.subTier,
      months: events.months,
      giftCount: events.giftCount,
      viewerCount: events.viewerCount,
      message: events.message,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .where(where)
    .orderBy(desc(events.occurredAt), desc(events.id))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  return { items, total: totalRow?.value ?? 0 };
}

/** Distinct-Liste aller vorkommenden Event-Typen für den Filter. */
export async function listEventTypes(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ eventType: events.eventType })
    .from(events)
    .orderBy(events.eventType);

  return rows.map((row) => row.eventType);
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

export interface ModerationFilters {
  /** UUIDs des gewählten Channels – eine Twitch-ID kann mehrere haben. */
  channelUuids?: string[];
  action?: string;
  target?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface ModerationListItem {
  id: number;
  channelName: string;
  action: string;
  targetUserId: string | null;
  targetUserName: string | null;
  durationSeconds: number | null;
  reason: string | null;
  deletedMessageContent: string | null;
  occurredAt: Date;
}

export async function listModerationActions(filters: ModerationFilters): Promise<{
  items: ModerationListItem[];
  total: number;
}> {
  const conditions: SQL[] = [];

  if (filters.channelUuids?.length) conditions.push(inArray(moderationActions.channelUuid, filters.channelUuids));
  if (filters.action) conditions.push(eq(moderationActions.action, filters.action));
  if (filters.target) conditions.push(like(moderationActions.targetUserName, `%${filters.target}%`));

  const from = parseDate(filters.from);
  const to = parseDate(filters.to, true);
  if (from) conditions.push(gte(moderationActions.occurredAt, from));
  if (to) conditions.push(lte(moderationActions.occurredAt, to));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow] = await db.select({ value: count() }).from(moderationActions).where(where);

  const items = await db
    .select({
      id: moderationActions.id,
      channelName: moderationActions.channelName,
      action: moderationActions.action,
      targetUserId: moderationActions.targetUserId,
      targetUserName: moderationActions.targetUserName,
      durationSeconds: moderationActions.durationSeconds,
      reason: moderationActions.reason,
      deletedMessageContent: moderationActions.deletedMessageContent,
      occurredAt: moderationActions.occurredAt,
    })
    .from(moderationActions)
    .where(where)
    .orderBy(desc(moderationActions.occurredAt), desc(moderationActions.id))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  return { items, total: totalRow?.value ?? 0 };
}

export async function listModerationActionTypes(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ action: moderationActions.action })
    .from(moderationActions)
    .orderBy(moderationActions.action);

  return rows.map((row) => row.action);
}

// ---------------------------------------------------------------------------
// Zuschauer
// ---------------------------------------------------------------------------

export interface ViewerFilters {
  search?: string;
  sort?: "messages" | "recent" | "name" | "first";
  page: number;
  pageSize: number;
}

export interface ViewerListItem {
  userId: string;
  userName: string;
  displayName: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  messageCount: number;
}

export async function listViewers(filters: ViewerFilters): Promise<{ items: ViewerListItem[]; total: number }> {
  const conditions: SQL[] = [];

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    const condition = or(
      like(viewers.userName, pattern),
      like(viewers.displayName, pattern),
      like(viewers.userId, pattern),
    );
    if (condition) conditions.push(condition);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const orderBy = {
    messages: desc(viewers.messageCount),
    recent: desc(viewers.lastSeenAt),
    name: viewers.userName,
    first: viewers.firstSeenAt,
  }[filters.sort ?? "messages"];

  const [totalRow] = await db.select({ value: count() }).from(viewers).where(where);

  const items = await db
    .select({
      userId: viewers.userId,
      userName: viewers.userName,
      displayName: viewers.displayName,
      firstSeenAt: viewers.firstSeenAt,
      lastSeenAt: viewers.lastSeenAt,
      messageCount: viewers.messageCount,
    })
    .from(viewers)
    .where(where)
    .orderBy(orderBy)
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  return { items, total: totalRow?.value ?? 0 };
}

export interface ViewerDetail extends ViewerListItem {
  channelsActive: Array<{ channelName: string; messageCount: number; lastMessageAt: Date }>;
  moderationCount: number;
}

export async function getViewerDetail(userId: string): Promise<ViewerDetail | null> {
  const [viewer] = await db.select().from(viewers).where(eq(viewers.userId, userId)).limit(1);
  if (!viewer) return null;

  const [channelRows, moderationRow] = await Promise.all([
    db
      .select({
        channelName: messages.channelName,
        messageCount: sql<number>`COUNT(*)`.mapWith(Number),
        lastMessageAt: sql<Date>`MAX(${messages.receivedAt})`,
      })
      .from(messages)
      .where(eq(messages.userId, userId))
      .groupBy(messages.channelName)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(20),
    db
      .select({ value: count() })
      .from(moderationActions)
      .where(eq(moderationActions.targetUserId, userId)),
  ]);

  return {
    ...viewer,
    channelsActive: channelRows,
    moderationCount: moderationRow[0]?.value ?? 0,
  };
}

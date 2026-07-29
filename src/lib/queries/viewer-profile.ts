import "server-only";
import { and, count, desc, eq, gt, gte, inArray, like, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { buildChannelFilterOptions, type ChannelFilterOption } from "@/lib/channel-filter";
import { adminViewerNotes, channels, events, messages, moderationActions, viewers } from "@/lib/db/schema";
import { isFounder, subscriberMonths } from "@/lib/twitch-tags";

export interface ViewerProfileNote {
  id: number;
  content: string;
  severity: string;
  pinned: boolean;
  authorUuid: string | null;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ViewerProfileMessage {
  id: number;
  messageId: string;
  channelId: string;
  channelName: string;
  content: string;
  color: string | null;
  emotes: string | null;
  /** Roher badges-Tag – nötig für die Abzeichenbilder des Channels. */
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

export interface ViewerProfileModeration {
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

export interface ViewerProfileEvent {
  id: number;
  channelName: string;
  eventType: string;
  userId: string | null;
  userName: string | null;
  subTier: string | null;
  months: number | null;
  giftCount: number | null;
  viewerCount: number | null;
  giftedByName: string | null;
  message: string | null;
  occurredAt: Date;
}

export interface ViewerChannelActivity {
  channelName: string;
  messageCount: number;
  lastMessageAt: Date;
}

export interface ViewerProfile {
  userId: string;
  userName: string;
  displayName: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  messageCount: number;

  /** Kennzahlen */
  bitsTotal: number;
  subMonthsMax: number | null;
  /** Höchste jemals beobachtete Abo-Stufe (Rohwert aus der Datenbank). */
  highestSubTier: string | null;
  moderationCount: number;
  banCount: number;
  timeoutCount: number;
  eventCount: number;
  /** Zuletzt beobachteter Rollenstatus aus der neuesten Nachricht. */
  lastKnownRoles: {
    isMod: boolean;
    isVip: boolean;
    isSubscriber: boolean;
    isBroadcaster: boolean;
    color: string | null;
  } | null;

  channels: ViewerChannelActivity[];
  notes: ViewerProfileNote[];
  recentMessages: ViewerProfileMessage[];
  moderationHistory: ViewerProfileModeration[];
  eventHistory: ViewerProfileEvent[];
}

/**
 * Lädt das vollständige Profil eines Zuschauers.
 * `includeNotes` steuert, ob die internen Notizen mitgeladen werden –
 * so wird das Recht bereits auf Query-Ebene berücksichtigt.
 */
export async function getViewerProfile(
  userId: string,
  options: {
    includeNotes: boolean;
    messageLimit?: number;
    /**
     * Detaillisten weglassen. Sinnvoll, wenn die Reiter des Profils
     * ihre Daten ohnehin seitenweise nachladen.
     */
    skipDetailLists?: boolean;
  },
): Promise<ViewerProfile | null> {
  const [viewer] = await db.select().from(viewers).where(eq(viewers.userId, userId)).limit(1);
  if (!viewer) return null;

  const messageLimit = options.skipDetailLists ? 0 : (options.messageLimit ?? 25);
  const detailLimit = options.skipDetailLists ? 0 : 25;

  const [
    channelRows,
    bitsRow,
    latestMessageRow,
    moderationCountRow,
    banCountRow,
    timeoutCountRow,
    eventCountRow,
    subStatsRow,
    notes,
    recentMessages,
    moderationHistory,
    eventHistory,
  ] = await Promise.all([
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
      .select({ total: sql<number>`COALESCE(SUM(${messages.bits}), 0)`.mapWith(Number) })
      .from(messages)
      .where(eq(messages.userId, userId)),

    db
      .select({
        isMod: messages.isMod,
        isVip: messages.isVip,
        isSubscriber: messages.isSubscriber,
        isBroadcaster: messages.isBroadcaster,
        color: messages.color,
      })
      .from(messages)
      .where(eq(messages.userId, userId))
      .orderBy(desc(messages.receivedAt))
      .limit(1),

    db.select({ value: count() }).from(moderationActions).where(eq(moderationActions.targetUserId, userId)),

    db
      .select({ value: count() })
      .from(moderationActions)
      .where(and(eq(moderationActions.targetUserId, userId), eq(moderationActions.action, "ban"))),

    db
      .select({ value: count() })
      .from(moderationActions)
      .where(and(eq(moderationActions.targetUserId, userId), eq(moderationActions.action, "timeout"))),

    db.select({ value: count() }).from(events).where(eq(events.userId, userId)),

    db
      .select({
        maxMonths: sql<number | null>`MAX(${events.months})`,
        // "Prime" bleibt aussen vor, weil sich Prime nicht in die Zahlenlogik einordnet.
        maxTier: sql<string | null>`MAX(CASE WHEN ${events.subTier} REGEXP '^[0-9]+$' THEN ${events.subTier} END)`,
        hasPrime: sql<number>`SUM(CASE WHEN LOWER(${events.subTier}) = 'prime' THEN 1 ELSE 0 END)`.mapWith(Number),
      })
      .from(events)
      .where(eq(events.userId, userId)),

    options.includeNotes
      ? db
          .select({
            id: adminViewerNotes.id,
            content: adminViewerNotes.content,
            severity: adminViewerNotes.severity,
            pinned: adminViewerNotes.pinned,
            authorUuid: adminViewerNotes.authorUuid,
            authorName: adminViewerNotes.authorName,
            createdAt: adminViewerNotes.createdAt,
            updatedAt: adminViewerNotes.updatedAt,
          })
          .from(adminViewerNotes)
          .where(eq(adminViewerNotes.viewerUserId, userId))
          .orderBy(desc(adminViewerNotes.pinned), desc(adminViewerNotes.createdAt))
      : Promise.resolve([] as ViewerProfileNote[]),

    db
      .select({
        id: messages.id,
        messageId: messages.messageId,
        channelId: messages.channelId,
        channelName: messages.channelName,
        content: messages.content,
        color: messages.color,
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
      .where(eq(messages.userId, userId))
      .orderBy(desc(messages.receivedAt))
      .limit(Math.max(1, messageLimit)),

    db
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
      .where(eq(moderationActions.targetUserId, userId))
      .orderBy(desc(moderationActions.occurredAt))
      .limit(Math.max(1, detailLimit)),

    db
      .select({
        id: events.id,
        channelName: events.channelName,
        eventType: events.eventType,
        userId: events.userId,
        userName: events.userName,
        subTier: events.subTier,
        months: events.months,
        giftCount: events.giftCount,
        viewerCount: events.viewerCount,
        giftedByName: events.giftedByName,
        message: events.message,
        occurredAt: events.occurredAt,
      })
      .from(events)
      .where(eq(events.userId, userId))
      .orderBy(desc(events.occurredAt))
      .limit(Math.max(1, detailLimit)),
  ]);

  const subStats = subStatsRow[0];
  // Prime schlägt keine höhere Zahlenstufe, wird aber angezeigt, wenn es das Einzige ist.
  const highestSubTier = subStats?.maxTier ?? (subStats?.hasPrime ? "Prime" : null);

  return {
    userId: viewer.userId,
    userName: viewer.userName,
    displayName: viewer.displayName,
    firstSeenAt: viewer.firstSeenAt,
    lastSeenAt: viewer.lastSeenAt,
    messageCount: viewer.messageCount,

    bitsTotal: bitsRow[0]?.total ?? 0,
    subMonthsMax: subStats?.maxMonths ?? null,
    highestSubTier,
    moderationCount: moderationCountRow[0]?.value ?? 0,
    banCount: banCountRow[0]?.value ?? 0,
    timeoutCount: timeoutCountRow[0]?.value ?? 0,
    eventCount: eventCountRow[0]?.value ?? 0,
    lastKnownRoles: latestMessageRow[0] ?? null,

    channels: channelRows,
    notes,
    recentMessages,
    moderationHistory,
    eventHistory,
  };
}

// ---------------------------------------------------------------------------
// Blätterbare Detaillisten für die Reiter des Profils
// ---------------------------------------------------------------------------

export interface PagedResult<T> {
  items: T[];
  total: number;
}

export interface ViewerMessageFilters {
  /** UUIDs des gewählten Channels – eine Twitch-ID kann mehrere haben. */
  channelUuids?: string[];
  /** Volltextsuche im Nachrichteninhalt. */
  content?: string;
  /** Datum im Format YYYY-MM-DD. */
  from?: string;
  to?: string;
  /** Nur Nachrichten mit Bits. */
  withBits?: boolean;
}

function parseFilterDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const date = new Date(endOfDay ? `${value}T23:59:59.999` : `${value}T00:00:00.000`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Nachrichten eines Zuschauers, seitenweise und filterbar. */
export async function getViewerMessagesPage(
  userId: string,
  page: number,
  pageSize: number,
  filters: ViewerMessageFilters = {},
): Promise<PagedResult<ViewerProfileMessage>> {
  const conditions = [eq(messages.userId, userId)];

  if (filters.channelUuids?.length) conditions.push(inArray(messages.channelUuid, filters.channelUuids));
  if (filters.content) conditions.push(like(messages.content, `%${filters.content}%`));
  if (filters.withBits) conditions.push(gt(messages.bits, 0));

  const from = parseFilterDate(filters.from);
  const to = parseFilterDate(filters.to, true);
  if (from) conditions.push(gte(messages.receivedAt, from));
  if (to) conditions.push(lte(messages.receivedAt, to));

  const where = and(...conditions);

  const [totalRow, items] = await Promise.all([
    db.select({ value: count() }).from(messages).where(where),
    db
      .select({
        id: messages.id,
        messageId: messages.messageId,
        channelId: messages.channelId,
        channelName: messages.channelName,
        content: messages.content,
        color: messages.color,
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
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  return { items, total: totalRow[0]?.value ?? 0 };
}

/**
 * Channels, in denen dieser Zuschauer geschrieben hat – für das Filter-Dropdown.
 *
 * Anders als die Listenseiten bleibt die Auswahl auf die Channels dieses
 * Zuschauers beschränkt; die Gruppierung nach Twitch-ID ist dieselbe, damit ein
 * umbenannter oder neu angelegter Channel nicht doppelt erscheint.
 */
export async function getViewerChannelOptions(userId: string): Promise<ChannelFilterOption[]> {
  const rows = await db
    .selectDistinct({
      uuid: messages.channelUuid,
      twitchId: messages.channelId,
      name: messages.channelName,
    })
    .from(messages)
    .where(eq(messages.userId, userId))
    .orderBy(desc(messages.channelUuid));

  const registeredRows = await db.select({ uuid: channels.uuid, name: channels.name }).from(channels);
  const registered = new Map(registeredRows.map((row) => [row.uuid, row.name]));

  return buildChannelFilterOptions(rows, registered);
}

/** Events eines Zuschauers, seitenweise. */
export async function getViewerEventsPage(
  userId: string,
  page: number,
  pageSize: number,
): Promise<PagedResult<ViewerProfileEvent>> {
  const [totalRow, items] = await Promise.all([
    db.select({ value: count() }).from(events).where(eq(events.userId, userId)),
    db
      .select({
        id: events.id,
        channelName: events.channelName,
        eventType: events.eventType,
        userId: events.userId,
        userName: events.userName,
        subTier: events.subTier,
        months: events.months,
        giftCount: events.giftCount,
        viewerCount: events.viewerCount,
        giftedByName: events.giftedByName,
        message: events.message,
        occurredAt: events.occurredAt,
      })
      .from(events)
      .where(eq(events.userId, userId))
      .orderBy(desc(events.occurredAt), desc(events.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  return { items, total: totalRow[0]?.value ?? 0 };
}

/** Moderationsaktionen gegen einen Zuschauer, seitenweise. */
export async function getViewerModerationPage(
  userId: string,
  page: number,
  pageSize: number,
): Promise<PagedResult<ViewerProfileModeration>> {
  const [totalRow, items] = await Promise.all([
    db.select({ value: count() }).from(moderationActions).where(eq(moderationActions.targetUserId, userId)),
    db
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
      .where(eq(moderationActions.targetUserId, userId))
      .orderBy(desc(moderationActions.occurredAt), desc(moderationActions.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  return { items, total: totalRow[0]?.value ?? 0 };
}

export interface SubscriptionSpan {
  /** Höchste beobachtete Abo-Dauer in Monaten. */
  maxMonths: number;
  /** Wann diese Dauer zuletzt bestätigt wurde. */
  lastSeenAt: Date;
  /** Erste Nachricht, in der ein Abo-Abzeichen auftauchte. */
  firstSubAt: Date | null;
  /** War der Nutzer Gründer des Kanals? */
  isFounder: boolean;
}

/**
 * Liest die tatsächliche Abo-Dauer aus `badge_info` der Chatnachrichten.
 *
 * Das ist genauer als die Event-Daten: `badge_info` kommt bei JEDER Nachricht
 * mit und nennt die laufende Monatszahl, während Events nur zum Zeitpunkt
 * einer Verlängerung entstehen.
 *
 * Betrachtet werden die neuesten 5000 Nachrichten des Nutzers – das genügt,
 * um den aktuellen Stand zu bestimmen, ohne die Datenbank zu belasten.
 */
export async function getSubscriptionInfo(userId: string): Promise<SubscriptionSpan | null> {
  const rows = await db
    .select({
      badgeInfo: messages.badgeInfo,
      badges: messages.badges,
      receivedAt: messages.receivedAt,
    })
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.isSubscriber, true)))
    .orderBy(desc(messages.receivedAt))
    .limit(5000);

  if (rows.length === 0) return null;

  let maxMonths = 0;
  let lastSeenAt: Date | null = null;
  let firstSubAt: Date | null = null;
  let founder = false;

  for (const row of rows) {
    const months = subscriberMonths(row.badgeInfo);
    if (isFounder(row.badges)) founder = true;

    if (months !== null && months > maxMonths) {
      maxMonths = months;
      lastSeenAt = row.receivedAt;
    }

    if (!firstSubAt || row.receivedAt < firstSubAt) firstSubAt = row.receivedAt;
  }

  if (maxMonths === 0) return null;

  return {
    maxMonths,
    lastSeenAt: lastSeenAt ?? rows[0].receivedAt,
    firstSubAt,
    isFounder: founder,
  };
}

export interface ViewerActivityPoint {
  bucket: string;
  messages: number;
}

/** Täglicher Nachrichtenverlauf eines Zuschauers, Lücken aufgefüllt. */
export async function getViewerActivity(userId: string, days = 30): Promise<ViewerActivityPoint[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  since.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      bucket: sql<string>`DATE_FORMAT(${messages.receivedAt}, '%Y-%m-%d')`,
      total: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(messages)
    .where(and(eq(messages.userId, userId), sql`${messages.receivedAt} >= ${since}`))
    .groupBy(sql`DATE_FORMAT(${messages.receivedAt}, '%Y-%m-%d')`);

  const map = new Map(rows.map((row) => [row.bucket, row.total]));
  const points: ViewerActivityPoint[] = [];

  for (let time = since.getTime(); time <= Date.now(); time += 24 * 60 * 60 * 1000) {
    const date = new Date(time);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    points.push({ bucket: date.toISOString(), messages: map.get(key) ?? 0 });
  }

  return points;
}

export interface HourDistributionPoint {
  hour: string;
  messages: number;
}

/** Verteilung der Nachrichten über die Tagesstunden. */
export async function getViewerHourDistribution(userId: string): Promise<HourDistributionPoint[]> {
  const rows = await db
    .select({
      hour: sql<number>`HOUR(${messages.receivedAt})`.mapWith(Number),
      total: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(messages)
    .where(eq(messages.userId, userId))
    .groupBy(sql`HOUR(${messages.receivedAt})`);

  const map = new Map(rows.map((row) => [row.hour, row.total]));

  return Array.from({ length: 24 }, (_, hour) => ({
    hour: `${String(hour).padStart(2, "0")} Uhr`,
    messages: map.get(hour) ?? 0,
  }));
}

export interface WeekdayDistributionPoint {
  day: string;
  messages: number;
}

const WEEKDAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Verteilung der Nachrichten über die Wochentage. */
export async function getViewerWeekdayDistribution(userId: string): Promise<WeekdayDistributionPoint[]> {
  const rows = await db
    .select({
      // MySQL: DAYOFWEEK liefert 1 = Sonntag.
      day: sql<number>`DAYOFWEEK(${messages.receivedAt})`.mapWith(Number),
      total: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(messages)
    .where(eq(messages.userId, userId))
    .groupBy(sql`DAYOFWEEK(${messages.receivedAt})`);

  const map = new Map(rows.map((row) => [row.day, row.total]));

  // Montag als erster Tag der Woche.
  const order = [2, 3, 4, 5, 6, 7, 1];
  return order.map((index) => ({
    day: WEEKDAY_LABELS[index - 1],
    messages: map.get(index) ?? 0,
  }));
}

/**
 * Filtert eine Liste von Twitch-User-IDs auf die, die in der
 * Chatdatenbank bekannt sind – für Verlinkungen aus dem Konverter.
 */
export async function getKnownViewerIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const rows = await db
    .select({ userId: viewers.userId })
    .from(viewers)
    .where(inArray(viewers.userId, userIds));

  return new Set(rows.map((row) => row.userId));
}

/** Zählt Notizen für mehrere Zuschauer – für die Markierung in der Liste. */
export async function countNotesForViewers(userIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (userIds.length === 0) return result;

  const rows = await db
    .select({
      viewerUserId: adminViewerNotes.viewerUserId,
      total: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(adminViewerNotes)
    .where(inArray(adminViewerNotes.viewerUserId, userIds))
    .groupBy(adminViewerNotes.viewerUserId);

  for (const row of rows) result.set(row.viewerUserId, row.total);
  return result;
}

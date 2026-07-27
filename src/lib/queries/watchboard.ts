import "server-only";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminViewerNotes, moderationActions, viewers } from "@/lib/db/schema";
import { inRange } from "@/lib/queries/range-filter";
import type { ResolvedRange } from "@/lib/range";

/**
 * Beobachtungsliste: Chatter, die aus mehreren Gründen auffällig sind.
 *
 * Die Bewertung ist bewusst einfach und nachvollziehbar – jeder Punktwert
 * lässt sich in der Anzeige begründen. Es geht um eine Arbeitsliste für
 * das Team, nicht um eine automatische Beurteilung.
 */

export interface WatchboardEntry {
  userId: string;
  userName: string;
  displayName: string | null;
  lastSeenAt: Date;
  messageCount: number;

  /** Notizen */
  noteCount: number;
  criticalNotes: number;
  warningNotes: number;
  latestNote: string | null;
  latestNoteAt: Date | null;

  /** Moderation */
  banCount: number;
  timeoutCount: number;
  moderationCount: number;
  lastModerationAt: Date | null;

  /** Summe der Auffälligkeiten – bestimmt die Reihenfolge. */
  score: number;
  reasons: string[];
}

export interface WatchboardFilters {
  /** Zeitraum für die Moderationszählung. */
  range: ResolvedRange;
  /** Nur Chatter mit mindestens einer kritischen Notiz. */
  onlyCritical?: boolean;
  limit: number;
}

/**
 * Punktwerte je Auffälligkeit. Bewusst als Konstanten, damit die
 * Gewichtung an einer Stelle nachvollziehbar bleibt.
 */
const SCORE = {
  criticalNote: 40,
  warningNote: 15,
  infoNote: 3,
  ban: 30,
  timeout: 8,
  otherModeration: 2,
} as const;

export async function getWatchboard(filters: WatchboardFilters): Promise<WatchboardEntry[]> {
  // Kandidaten sind alle mit Notizen oder mit Moderationshistorie im Zeitraum.
  const [noteRows, moderationRows] = await Promise.all([
    db
      .select({
        userId: adminViewerNotes.viewerUserId,
        total: sql<number>`COUNT(*)`.mapWith(Number),
        critical: sql<number>`SUM(CASE WHEN ${adminViewerNotes.severity} = 'critical' THEN 1 ELSE 0 END)`.mapWith(
          Number,
        ),
        warning: sql<number>`SUM(CASE WHEN ${adminViewerNotes.severity} = 'warning' THEN 1 ELSE 0 END)`.mapWith(Number),
        latestAt: sql<Date | null>`MAX(${adminViewerNotes.createdAt})`,
      })
      .from(adminViewerNotes)
      .groupBy(adminViewerNotes.viewerUserId),

    db
      .select({
        userId: moderationActions.targetUserId,
        total: sql<number>`COUNT(*)`.mapWith(Number),
        bans: sql<number>`SUM(CASE WHEN ${moderationActions.action} = 'ban' THEN 1 ELSE 0 END)`.mapWith(Number),
        timeouts: sql<number>`SUM(CASE WHEN ${moderationActions.action} = 'timeout' THEN 1 ELSE 0 END)`.mapWith(Number),
        lastAt: sql<Date | null>`MAX(${moderationActions.occurredAt})`,
      })
      .from(moderationActions)
      .where(and(isNotNull(moderationActions.targetUserId), inRange(moderationActions.occurredAt, filters.range)))
      .groupBy(moderationActions.targetUserId),
  ]);

  const noteMap = new Map(noteRows.map((row) => [row.userId, row]));
  const modMap = new Map(moderationRows.filter((row) => row.userId).map((row) => [row.userId as string, row]));

  const candidateIds = [...new Set([...noteMap.keys(), ...modMap.keys()])];
  if (candidateIds.length === 0) return [];

  // Stammdaten der Kandidaten nachladen.
  const viewerRows = await db
    .select({
      userId: viewers.userId,
      userName: viewers.userName,
      displayName: viewers.displayName,
      lastSeenAt: viewers.lastSeenAt,
      messageCount: viewers.messageCount,
    })
    .from(viewers)
    .where(inArray(viewers.userId, candidateIds));

  const viewerMap = new Map(viewerRows.map((row) => [row.userId, row]));

  // Die neueste Notiz je Kandidat für die Vorschau.
  const latestNotes = await db
    .select({
      userId: adminViewerNotes.viewerUserId,
      content: adminViewerNotes.content,
      createdAt: adminViewerNotes.createdAt,
    })
    .from(adminViewerNotes)
    .where(inArray(adminViewerNotes.viewerUserId, candidateIds))
    .orderBy(desc(adminViewerNotes.createdAt));

  const latestNoteMap = new Map<string, string>();
  for (const note of latestNotes) {
    if (!latestNoteMap.has(note.userId)) latestNoteMap.set(note.userId, note.content);
  }

  const entries: WatchboardEntry[] = [];

  for (const userId of candidateIds) {
    const viewer = viewerMap.get(userId);
    // Ohne Stammdatensatz fehlt der Name – solche Einträge überspringen.
    if (!viewer) continue;

    const notes = noteMap.get(userId);
    const moderation = modMap.get(userId);

    const criticalNotes = notes?.critical ?? 0;
    const warningNotes = notes?.warning ?? 0;
    const noteCount = notes?.total ?? 0;
    const infoNotes = Math.max(0, noteCount - criticalNotes - warningNotes);

    const bans = moderation?.bans ?? 0;
    const timeouts = moderation?.timeouts ?? 0;
    const moderationCount = moderation?.total ?? 0;
    const otherModeration = Math.max(0, moderationCount - bans - timeouts);

    if (filters.onlyCritical && criticalNotes === 0) continue;

    const score =
      criticalNotes * SCORE.criticalNote +
      warningNotes * SCORE.warningNote +
      infoNotes * SCORE.infoNote +
      bans * SCORE.ban +
      timeouts * SCORE.timeout +
      otherModeration * SCORE.otherModeration;

    if (score === 0) continue;

    const reasons: string[] = [];
    if (criticalNotes > 0) reasons.push(`${criticalNotes}× kritische Notiz`);
    if (warningNotes > 0) reasons.push(`${warningNotes}× Warnung`);
    if (bans > 0) reasons.push(`${bans}× gebannt`);
    if (timeouts > 0) reasons.push(`${timeouts}× Timeout`);

    entries.push({
      userId,
      userName: viewer.userName,
      displayName: viewer.displayName,
      lastSeenAt: viewer.lastSeenAt,
      messageCount: viewer.messageCount,
      noteCount,
      criticalNotes,
      warningNotes,
      latestNote: latestNoteMap.get(userId) ?? null,
      latestNoteAt: notes?.latestAt ? new Date(notes.latestAt) : null,
      banCount: bans,
      timeoutCount: timeouts,
      moderationCount,
      lastModerationAt: moderation?.lastAt ? new Date(moderation.lastAt) : null,
      score,
      reasons,
    });
  }

  return entries.sort((a, b) => b.score - a.score).slice(0, filters.limit);
}

import "server-only";
import { and, count, desc, eq, gte, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminWatchTerms, messages } from "@/lib/db/schema";
import { findMatches, type TermMatch, type WatchTermLike } from "@/lib/watchlist";

export interface WatchTermRow {
  id: number;
  term: string;
  matchType: string;
  severity: string;
  caseSensitive: boolean;
  active: boolean;
  note: string | null;
  channelUuid: string | null;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function listWatchTerms(): Promise<WatchTermRow[]> {
  return db
    .select({
      id: adminWatchTerms.id,
      term: adminWatchTerms.term,
      matchType: adminWatchTerms.matchType,
      severity: adminWatchTerms.severity,
      caseSensitive: adminWatchTerms.caseSensitive,
      active: adminWatchTerms.active,
      note: adminWatchTerms.note,
      channelUuid: adminWatchTerms.channelUuid,
      createdByName: adminWatchTerms.createdByName,
      createdAt: adminWatchTerms.createdAt,
      updatedAt: adminWatchTerms.updatedAt,
    })
    .from(adminWatchTerms)
    .orderBy(desc(adminWatchTerms.active), adminWatchTerms.term);
}

/** Nur die aktiven Begriffe – Grundlage für die Hervorhebung. */
export async function getActiveWatchTerms(): Promise<WatchTermLike[]> {
  const rows = await db
    .select({
      id: adminWatchTerms.id,
      term: adminWatchTerms.term,
      matchType: adminWatchTerms.matchType,
      severity: adminWatchTerms.severity,
      caseSensitive: adminWatchTerms.caseSensitive,
      channelUuid: adminWatchTerms.channelUuid,
    })
    .from(adminWatchTerms)
    .where(eq(adminWatchTerms.active, true));

  return rows;
}

/**
 * Baut die SQL-Bedingung, die alle Nachrichten mit möglichen Treffern findet.
 *
 * Die Vorauswahl passiert absichtlich grob über LIKE – reguläre Ausdrücke
 * lassen sich in MySQL nicht indizieren. Die genaue Prüfung erfolgt danach
 * in JavaScript, sodass Wortgrenzen und Muster korrekt greifen.
 */
function buildTermCondition(terms: WatchTermLike[]): SQL | undefined {
  const conditions: SQL[] = [];

  for (const term of terms) {
    if (term.matchType === "regex") {
      // MySQL kann REGEXP – das übernimmt hier die Vorauswahl.
      conditions.push(sql`${messages.content} REGEXP ${term.term}`);
    } else {
      conditions.push(like(messages.content, `%${term.term}%`));
    }
  }

  return conditions.length > 0 ? or(...conditions) : undefined;
}

export interface WatchHit {
  id: number;
  channelUuid: string;
  channelName: string;
  userId: string;
  userName: string;
  displayName: string | null;
  color: string | null;
  content: string;
  receivedAt: Date;
  matches: TermMatch[];
}

export interface WatchHitFilters {
  /** Nur Treffer eines bestimmten Begriffs. */
  termId?: number;
  channelUuid?: string;
  /** Nur Treffer ab dieser Stufe. */
  severity?: string;
  /** Zeitraum in Tagen. */
  days?: number;
  page: number;
  pageSize: number;
}

/**
 * Sucht Nachrichten, die auf beobachtete Begriffe passen.
 *
 * Weil die genaue Prüfung erst in JavaScript stattfindet, wird bewusst
 * ein Vielfaches der Seitengröße geladen und danach gefiltert. Die
 * Gesamtzahl ist deshalb eine Obergrenze, keine exakte Zahl.
 */
export async function findWatchHits(
  terms: WatchTermLike[],
  filters: WatchHitFilters,
): Promise<{ hits: WatchHit[]; approximateTotal: number; truncated: boolean }> {
  const relevant = filters.termId ? terms.filter((term) => term.id === filters.termId) : terms;
  if (relevant.length === 0) return { hits: [], approximateTotal: 0, truncated: false };

  const conditions: SQL[] = [];

  const termCondition = buildTermCondition(relevant);
  if (termCondition) conditions.push(termCondition);
  if (filters.channelUuid) conditions.push(eq(messages.channelUuid, filters.channelUuid));

  if (filters.days) {
    conditions.push(gte(messages.receivedAt, new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000)));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Grosszuegig laden, weil die Feinpruefung noch Zeilen aussortiert.
  const scanLimit = filters.pageSize * filters.page * 4;

  const [totalRow, candidates] = await Promise.all([
    db.select({ value: count() }).from(messages).where(where),
    db
      .select({
        id: messages.id,
        channelUuid: messages.channelUuid,
        channelName: messages.channelName,
        userId: messages.userId,
        userName: messages.userName,
        displayName: messages.displayName,
        color: messages.color,
        content: messages.content,
        receivedAt: messages.receivedAt,
      })
      .from(messages)
      .where(where)
      .orderBy(desc(messages.receivedAt), desc(messages.id))
      .limit(Math.min(scanLimit, 2000)),
  ]);

  const hits: WatchHit[] = [];

  for (const row of candidates) {
    const matches = findMatches(row.content, relevant, row.channelUuid);
    if (matches.length === 0) continue;

    if (filters.severity && !matches.some((match) => match.severity === filters.severity)) continue;

    hits.push({ ...row, matches });
  }

  const start = (filters.page - 1) * filters.pageSize;

  return {
    hits: hits.slice(start, start + filters.pageSize),
    approximateTotal: totalRow[0]?.value ?? 0,
    truncated: candidates.length >= Math.min(scanLimit, 2000),
  };
}

export interface TermStat {
  termId: number;
  term: string;
  severity: string;
  /** Treffer im betrachteten Zeitraum. */
  hits: number;
  lastHitAt: Date | null;
}

/**
 * Zaehlt Treffer je Begriff – fuer die Uebersicht in der Verwaltung.
 *
 * Bewusst EINE Abfrage mit bedingten Summen statt einer pro Begriff:
 * bei zwanzig Begriffen waeren das sonst zwanzig Roundtrips zur Datenbank,
 * was ueber eine langsame Verbindung deutlich spuerbar ist.
 */
export async function getTermStats(terms: WatchTermLike[], days = 30): Promise<TermStat[]> {
  if (terms.length === 0) return [];

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Je Begriff zwei Ausdruecke: Trefferzahl und juengster Treffer.
  const selection: Record<string, SQL> = {};

  for (const term of terms) {
    const condition =
      term.matchType === "regex"
        ? sql`${messages.content} REGEXP ${term.term}`
        : sql`${messages.content} LIKE ${`%${term.term}%`}`;

    selection[`c${term.id}`] = sql<number>`SUM(CASE WHEN ${condition} THEN 1 ELSE 0 END)`;
    selection[`l${term.id}`] = sql<Date | null>`MAX(CASE WHEN ${condition} THEN ${messages.receivedAt} END)`;
  }

  const [row] = await db
    .select(selection)
    .from(messages)
    .where(gte(messages.receivedAt, since));

  const stats: TermStat[] = terms.map((term) => {
    const hits = Number((row as Record<string, unknown>)?.[`c${term.id}`] ?? 0);
    const lastHit = (row as Record<string, unknown>)?.[`l${term.id}`];

    return {
      termId: term.id,
      term: term.term,
      severity: term.severity,
      hits: Number.isFinite(hits) ? hits : 0,
      lastHitAt: lastHit ? new Date(lastHit as string | Date) : null,
    };
  });

  return stats.sort((a, b) => b.hits - a.hits);
}

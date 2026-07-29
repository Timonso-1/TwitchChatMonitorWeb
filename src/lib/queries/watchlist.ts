import "server-only";
import { and, count, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminWatchTerms, messages } from "@/lib/db/schema";
import { inRange } from "@/lib/queries/range-filter";
import type { ResolvedRange } from "@/lib/range";
import { buildTermPattern, findMatches, type TermMatch, type WatchTermLike } from "@/lib/watchlist";

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
  /** UUIDs des gewählten Channels – eine Twitch-ID kann mehrere haben. */
  channelUuids?: string[];
  /** Nur Treffer ab dieser Stufe. */
  severity?: string;
  /** Zeitraum – ohne Angabe wird der gesamte Bestand durchsucht. */
  range?: ResolvedRange;
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
  if (filters.channelUuids?.length) conditions.push(inArray(messages.channelUuid, filters.channelUuids));

  if (filters.range) conditions.push(inRange(messages.receivedAt, filters.range));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Großzügig laden, weil die Feinprüfung noch Zeilen aussortiert.
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
 * Zählt Treffer je Begriff – für die Uebersicht in der Verwaltung.
 *
 * Bewusst EINE Abfrage mit bedingten Summen statt einer pro Begriff:
 * bei zwanzig Begriffen wären das sonst zwanzig Roundtrips zur Datenbank,
 * was über eine langsame Verbindung deutlich spürbar ist.
 */
export async function getTermStats(terms: WatchTermLike[], range: ResolvedRange): Promise<TermStat[]> {
  if (terms.length === 0) return [];

  // Je Begriff zwei Ausdrücke: Trefferzahl und jüngster Treffer.
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
    .where(inRange(messages.receivedAt, range));

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

/**
 * Wie viele der jüngsten Nachrichten die Vorschau prüft.
 *
 * Bewusst ein festes Fenster statt des gesamten Bestands: die Prüfung läuft in
 * JavaScript, weil Regex-Begriffe nicht nach SQL übersetzbar sind. Ein paar
 * tausend Nachrichten genügen, um ein zu weites Muster zu erkennen – ein `.*`
 * trifft schon in den ersten Zeilen alles.
 */
export const PREVIEW_SCAN_LIMIT = 2000;

export interface WatchTermPreviewHit {
  messageId: string;
  channelName: string;
  userName: string;
  displayName: string | null;
  content: string;
  receivedAt: Date;
  matches: TermMatch[];
}

export interface WatchTermPreview {
  /** Wie viele Nachrichten tatsächlich geprüft wurden. */
  scanned: number;
  /** Treffer im geprüften Fenster insgesamt. */
  hits: number;
  /** Die jüngsten Treffer als Beispiel. */
  samples: WatchTermPreviewHit[];
}

const PREVIEW_SAMPLES = 8;

/**
 * Probelauf eines Begriffs gegen die zuletzt aufgezeichneten Nachrichten.
 *
 * Beantwortet die Frage, die die Syntaxprüfung offen lässt: Ein `.*` ist ein
 * gültiger regulärer Ausdruck und trifft trotzdem jede Nachricht. Ohne
 * Probelauf fällt das erst auf, wenn der Begriff aktiv ist.
 */
export async function previewWatchTerm(input: {
  term: string;
  matchType: string;
  caseSensitive: boolean;
  channelUuid?: string | null;
}): Promise<WatchTermPreview> {
  const candidate: WatchTermLike = {
    id: 0,
    term: input.term,
    matchType: input.matchType,
    severity: "info",
    caseSensitive: input.caseSensitive,
  };

  // Ungültiges Muster: keine Treffer statt eines Fehlers – die Meldung dazu
  // liefert bereits die Syntaxprüfung der Server Action.
  if (!buildTermPattern(candidate)) return { scanned: 0, hits: 0, samples: [] };

  const conditions: SQL[] = [];
  if (input.channelUuid) conditions.push(eq(messages.channelUuid, input.channelUuid));

  const rows = await db
    .select({
      messageId: messages.messageId,
      channelUuid: messages.channelUuid,
      channelName: messages.channelName,
      userName: messages.userName,
      displayName: messages.displayName,
      content: messages.content,
      receivedAt: messages.receivedAt,
    })
    .from(messages)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(messages.id))
    .limit(PREVIEW_SCAN_LIMIT);

  let hits = 0;
  const samples: WatchTermPreviewHit[] = [];

  for (const row of rows) {
    const matches = findMatches(row.content, [candidate], row.channelUuid);
    if (matches.length === 0) continue;

    hits++;
    if (samples.length < PREVIEW_SAMPLES) {
      const { channelUuid: _unused, ...rest } = row;
      samples.push({ ...rest, matches });
    }
  }

  return { scanned: rows.length, hits, samples };
}

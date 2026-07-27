import "server-only";
import { unstable_cache } from "next/cache";
import { and, count, gte, lt, lte, sql } from "drizzle-orm";
import type { MySqlColumn, MySqlTable } from "drizzle-orm/mysql-core";
import { db } from "@/lib/db";
import { events, messages, moderationActions, viewers } from "@/lib/db/schema";
import type { ResolvedRange } from "@/lib/range";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export interface TrendPoint {
  /** ISO-Zeitpunkt des Intervallbeginns. */
  bucket: string;
  /** Neuzugänge in diesem Intervall. */
  value: number;
  /** Kumulierter Bestand bis einschliesslich dieses Intervalls. */
  total: number;
}

/** Alter Name, weiterhin verwendet von Diagramm-Komponenten. */
export type DailyPoint = TrendPoint;

export interface TrendSummary {
  /** Summe im aktuellen Zeitraum. */
  current: number;
  /** Summe im gleich langen Zeitraum davor – Grundlage des Trendvergleichs. */
  previous: number;
  /** Gesamtbestand über alle Zeiten. */
  total: number;
  /**
   * false, wenn die Vergleichsperiode ganz oder teilweise vor dem ersten
   * Datensatz liegt. Ein Prozentwert wäre dann irreführend, weil er
   * fehlende Aufzeichnung mit echtem Wachstum verwechselt.
   */
  comparable: boolean;
  /** Ältester bekannter Datensatz – erklärt, warum kein Vergleich möglich ist. */
  earliestRecord: Date | null;
  points: TrendPoint[];
}

function bucketKey(date: Date, hourly: boolean): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (!hourly) return `${year}-${month}-${day}`;

  return `${year}-${month}-${day} ${String(date.getHours()).padStart(2, "0")}`;
}

/**
 * Füllt Intervalle ohne Datensätze auf und rechnet den kumulierten Bestand
 * hoch. `baseline` ist der Bestand vor Beginn des Zeitraums.
 */
function buildSeries(rows: Array<{ bucket: string; total: number }>, range: ResolvedRange, baseline: number): TrendPoint[] {
  const map = new Map(rows.map((row) => [row.bucket, row.total]));
  const points: TrendPoint[] = [];
  const step = range.hourly ? HOUR_MS : DAY_MS;

  const start = new Date(range.start);
  if (range.hourly) start.setMinutes(0, 0, 0);

  let running = baseline;
  const limit = range.end.getTime();

  for (let time = start.getTime(); time <= limit; time += step) {
    const date = new Date(time);
    const value = map.get(bucketKey(date, range.hourly)) ?? 0;
    running += value;

    points.push({ bucket: date.toISOString(), value, total: running });
  }

  return points;
}

function cachedTableCount(cacheKey: string, run: () => Promise<number>) {
  return unstable_cache(run, [`trend-total-${cacheKey}`], { revalidate: 60 })();
}

/**
 * Verlauf und Kennzahlen einer Tabelle über den gewählten Zeitraum.
 *
 * Die vier Auswertungen (Nachrichten, Events, Moderation, Zuschauer)
 * unterscheiden sich nur in Tabelle und Zeitstempelspalte – deshalb eine
 * gemeinsame Implementierung statt vier gleicher Abfrageblöcke.
 */
async function buildTrend(
  cacheKey: string,
  table: MySqlTable,
  column: MySqlColumn,
  range: ResolvedRange,
): Promise<TrendSummary> {
  const { start, end, previousStart } = range;
  const format = range.hourly ? "%Y-%m-%d %H" : "%Y-%m-%d";
  const grouping = sql`DATE_FORMAT(${column}, ${format})`;
  const inCurrentRange = and(gte(column, start), lte(column, end));

  const [rows, previousRow, total, baselineRow, priorSample] = await Promise.all([
    db
      .select({
        bucket: sql<string>`DATE_FORMAT(${column}, ${format})`,
        total: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(table)
      .where(inCurrentRange)
      .groupBy(grouping),
    db
      .select({ value: count() })
      .from(table)
      .where(and(gte(column, previousStart), lt(column, start))),
    cachedTableCount(cacheKey, async () => {
      const [row] = await db.select({ value: count() }).from(table);
      return row?.value ?? 0;
    }),
    db.select({ value: count() }).from(table).where(lt(column, start)),
    // Schneller als MIN(): bricht nach dem ersten Treffer ab.
    db
      .select({ value: sql<number>`1`.mapWith(Number) })
      .from(table)
      .where(lte(column, previousStart))
      .limit(1),
  ]);

  const current = rows.reduce((sum, row) => sum + row.total, 0);
  const comparable = (priorSample[0]?.value ?? 0) === 1;

  let earliestRecord: Date | null = null;
  if (!comparable) {
    const [earliestRow] = await db.select({ value: column }).from(table).orderBy(column).limit(1);
    earliestRecord = earliestRow?.value ? new Date(earliestRow.value as Date) : null;
  }

  return {
    current,
    previous: previousRow[0]?.value ?? 0,
    total,
    comparable,
    earliestRecord,
    points: buildSeries(rows, range, baselineRow[0]?.value ?? 0),
  };
}

export function getViewerTrend(range: ResolvedRange): Promise<TrendSummary> {
  return buildTrend("viewers", viewers, viewers.firstSeenAt, range);
}

export function getMessageTrend(range: ResolvedRange): Promise<TrendSummary> {
  return buildTrend("messages", messages, messages.receivedAt, range);
}

export function getEventTrend(range: ResolvedRange): Promise<TrendSummary> {
  return buildTrend("events", events, events.occurredAt, range);
}

export function getModerationTrend(range: ResolvedRange): Promise<TrendSummary> {
  return buildTrend("moderation", moderationActions, moderationActions.occurredAt, range);
}

/**
 * Zuschauer, die im Zeitraum aktiv waren, aber schon vorher bekannt waren –
 * also wiederkehrend statt neu.
 */
export async function getReturningViewers(range: ResolvedRange): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(viewers)
    .where(and(gte(viewers.lastSeenAt, range.start), lte(viewers.lastSeenAt, range.end), lt(viewers.firstSeenAt, range.start)));

  return row?.value ?? 0;
}

/** Aktive Zuschauer im Zeitraum (neu oder wiederkehrend). */
export async function getActiveViewers(range: ResolvedRange): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(viewers)
    .where(and(gte(viewers.lastSeenAt, range.start), lte(viewers.lastSeenAt, range.end)));

  return row?.value ?? 0;
}

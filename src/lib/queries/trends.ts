import "server-only";
import { and, count, gte, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { events, messages, moderationActions, viewers } from "@/lib/db/schema";

/** Auswaehlbare Zeitraeume der Listen- und Verlaufsansichten. */
export const TREND_RANGES = [
  { value: 7, label: "7 Tage" },
  { value: 30, label: "30 Tage" },
  { value: 90, label: "90 Tage" },
  { value: 365, label: "12 Monate" },
] as const;

export type TrendRange = (typeof TREND_RANGES)[number]["value"];

export function normalizeTrendRange(value: unknown): TrendRange {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  const match = TREND_RANGES.find((option) => option.value === parsed);
  return match?.value ?? 30;
}

export function rangeLabel(days: number): string {
  return TREND_RANGES.find((option) => option.value === days)?.label ?? `${days} Tage`;
}

function startOfDayAgo(days: number): Date {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface DailyPoint {
  /** ISO-Zeitpunkt des Tagesbeginns. */
  bucket: string;
  /** Neuzugaenge an diesem Tag. */
  value: number;
  /** Kumulierter Bestand bis einschliesslich dieses Tages. */
  total: number;
}

/**
 * Fuellt Tageslueckendaten auf und rechnet den kumulierten Bestand hoch.
 * `baseline` ist der Bestand vor Beginn des Zeitraums.
 */
function buildDailySeries(rows: Array<{ day: string; total: number }>, days: number, baseline: number): DailyPoint[] {
  const map = new Map(rows.map((row) => [row.day, row.total]));
  const points: DailyPoint[] = [];

  let running = baseline;
  const start = startOfDayAgo(days);

  for (let time = start.getTime(); time <= Date.now(); time += 24 * 60 * 60 * 1000) {
    const date = new Date(time);
    const value = map.get(toDayKey(date)) ?? 0;
    running += value;

    points.push({ bucket: date.toISOString(), value, total: running });
  }

  return points;
}

export interface TrendSummary {
  /** Summe im aktuellen Zeitraum. */
  current: number;
  /** Summe im gleich langen Zeitraum davor – Grundlage des Trendvergleichs. */
  previous: number;
  /** Gesamtbestand über alle Zeiten. */
  total: number;
  /**
   * false, wenn die Vergleichsperiode ganz oder teilweise vor dem ersten
   * Datensatz liegt. Ein Prozentwert waere dann irrefuehrend, weil er
   * fehlende Aufzeichnung mit echtem Wachstum verwechselt.
   */
  comparable: boolean;
  /** Aeltester bekannter Datensatz – erklaert, warum kein Vergleich moeglich ist. */
  earliestRecord: Date | null;
  points: DailyPoint[];
}

/**
 * Der Vergleich ist nur sinnvoll, wenn die Vorperiode vollstaendig
 * innerhalb des aufgezeichneten Zeitraums liegt.
 */
function isComparable(earliest: Date | null, previousStart: Date): boolean {
  if (!earliest) return false;
  return earliest.getTime() <= previousStart.getTime();
}

export async function getViewerTrend(days: number): Promise<TrendSummary> {
  const start = startOfDayAgo(days);
  const previousStart = startOfDayAgo(days * 2);

  const [rows, currentRow, previousRow, totalRow, baselineRow, earliestRow] = await Promise.all([
    db
      .select({
        day: sql<string>`DATE_FORMAT(${viewers.firstSeenAt}, '%Y-%m-%d')`,
        total: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(viewers)
      .where(gte(viewers.firstSeenAt, start))
      .groupBy(sql`DATE_FORMAT(${viewers.firstSeenAt}, '%Y-%m-%d')`),
    db.select({ value: count() }).from(viewers).where(gte(viewers.firstSeenAt, start)),
    db
      .select({ value: count() })
      .from(viewers)
      .where(and(gte(viewers.firstSeenAt, previousStart), lt(viewers.firstSeenAt, start))),
    db.select({ value: count() }).from(viewers),
    db.select({ value: count() }).from(viewers).where(lt(viewers.firstSeenAt, start)),
    db.select({ value: sql<Date | null>`MIN(${viewers.firstSeenAt})` }).from(viewers),
  ]);

  const earliest = earliestRow[0]?.value ? new Date(earliestRow[0].value) : null;

  return {
    current: currentRow[0]?.value ?? 0,
    previous: previousRow[0]?.value ?? 0,
    total: totalRow[0]?.value ?? 0,
    comparable: isComparable(earliest, previousStart),
    earliestRecord: earliest,
    points: buildDailySeries(rows, days, baselineRow[0]?.value ?? 0),
  };
}

export async function getMessageTrend(days: number): Promise<TrendSummary> {
  const start = startOfDayAgo(days);
  const previousStart = startOfDayAgo(days * 2);

  const [rows, currentRow, previousRow, totalRow, baselineRow, earliestRow] = await Promise.all([
    db
      .select({
        day: sql<string>`DATE_FORMAT(${messages.receivedAt}, '%Y-%m-%d')`,
        total: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(messages)
      .where(gte(messages.receivedAt, start))
      .groupBy(sql`DATE_FORMAT(${messages.receivedAt}, '%Y-%m-%d')`),
    db.select({ value: count() }).from(messages).where(gte(messages.receivedAt, start)),
    db
      .select({ value: count() })
      .from(messages)
      .where(and(gte(messages.receivedAt, previousStart), lt(messages.receivedAt, start))),
    db.select({ value: count() }).from(messages),
    db.select({ value: count() }).from(messages).where(lt(messages.receivedAt, start)),
    db.select({ value: sql<Date | null>`MIN(${messages.receivedAt})` }).from(messages),
  ]);

  const earliest = earliestRow[0]?.value ? new Date(earliestRow[0].value) : null;

  return {
    current: currentRow[0]?.value ?? 0,
    previous: previousRow[0]?.value ?? 0,
    total: totalRow[0]?.value ?? 0,
    comparable: isComparable(earliest, previousStart),
    earliestRecord: earliest,
    points: buildDailySeries(rows, days, baselineRow[0]?.value ?? 0),
  };
}

export async function getEventTrend(days: number): Promise<TrendSummary> {
  const start = startOfDayAgo(days);
  const previousStart = startOfDayAgo(days * 2);

  const [rows, currentRow, previousRow, totalRow, baselineRow, earliestRow] = await Promise.all([
    db
      .select({
        day: sql<string>`DATE_FORMAT(${events.occurredAt}, '%Y-%m-%d')`,
        total: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(events)
      .where(gte(events.occurredAt, start))
      .groupBy(sql`DATE_FORMAT(${events.occurredAt}, '%Y-%m-%d')`),
    db.select({ value: count() }).from(events).where(gte(events.occurredAt, start)),
    db
      .select({ value: count() })
      .from(events)
      .where(and(gte(events.occurredAt, previousStart), lt(events.occurredAt, start))),
    db.select({ value: count() }).from(events),
    db.select({ value: count() }).from(events).where(lt(events.occurredAt, start)),
    db.select({ value: sql<Date | null>`MIN(${events.occurredAt})` }).from(events),
  ]);

  const earliest = earliestRow[0]?.value ? new Date(earliestRow[0].value) : null;

  return {
    current: currentRow[0]?.value ?? 0,
    previous: previousRow[0]?.value ?? 0,
    total: totalRow[0]?.value ?? 0,
    comparable: isComparable(earliest, previousStart),
    earliestRecord: earliest,
    points: buildDailySeries(rows, days, baselineRow[0]?.value ?? 0),
  };
}

export async function getModerationTrend(days: number): Promise<TrendSummary> {
  const start = startOfDayAgo(days);
  const previousStart = startOfDayAgo(days * 2);

  const [rows, currentRow, previousRow, totalRow, baselineRow, earliestRow] = await Promise.all([
    db
      .select({
        day: sql<string>`DATE_FORMAT(${moderationActions.occurredAt}, '%Y-%m-%d')`,
        total: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(moderationActions)
      .where(gte(moderationActions.occurredAt, start))
      .groupBy(sql`DATE_FORMAT(${moderationActions.occurredAt}, '%Y-%m-%d')`),
    db.select({ value: count() }).from(moderationActions).where(gte(moderationActions.occurredAt, start)),
    db
      .select({ value: count() })
      .from(moderationActions)
      .where(and(gte(moderationActions.occurredAt, previousStart), lt(moderationActions.occurredAt, start))),
    db.select({ value: count() }).from(moderationActions),
    db.select({ value: count() }).from(moderationActions).where(lt(moderationActions.occurredAt, start)),
    db.select({ value: sql<Date | null>`MIN(${moderationActions.occurredAt})` }).from(moderationActions),
  ]);

  const earliest = earliestRow[0]?.value ? new Date(earliestRow[0].value) : null;

  return {
    current: currentRow[0]?.value ?? 0,
    previous: previousRow[0]?.value ?? 0,
    total: totalRow[0]?.value ?? 0,
    comparable: isComparable(earliest, previousStart),
    earliestRecord: earliest,
    points: buildDailySeries(rows, days, baselineRow[0]?.value ?? 0),
  };
}

/**
 * Zuschauer, die im Zeitraum aktiv waren, aber schon vorher bekannt waren –
 * also wiederkehrend statt neu.
 */
export async function getReturningViewers(days: number): Promise<number> {
  const start = startOfDayAgo(days);

  const [row] = await db
    .select({ value: count() })
    .from(viewers)
    .where(and(gte(viewers.lastSeenAt, start), lt(viewers.firstSeenAt, start)));

  return row?.value ?? 0;
}

/** Aktive Zuschauer im Zeitraum (neu oder wiederkehrend). */
export async function getActiveViewers(days: number): Promise<number> {
  const start = startOfDayAgo(days);

  const [row] = await db.select({ value: count() }).from(viewers).where(gte(viewers.lastSeenAt, start));
  return row?.value ?? 0;
}

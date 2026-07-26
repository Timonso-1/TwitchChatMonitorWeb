import "server-only";
import { count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { channels, messages, viewers } from "@/lib/db/schema";

/**
 * Kennzahlen für die Anmeldeseite.
 *
 * ACHTUNG: Diese Werte sind ohne Anmeldung sichtbar. Deshalb ausschliesslich
 * aggregierte Zahlen – keine Channel-Namen, keine Nutzernamen, keine Inhalte.
 * Wer die Anzeige gar nicht will, setzt SHOW_PUBLIC_STATUS=false.
 */

export interface PublicStatus {
  channelsActive: number;
  messagesTotal: number;
  messages24h: number;
  viewersTotal: number;
  /** Zeitpunkt der zuletzt erfassten Nachricht – zeigt, ob der Bot läuft. */
  lastMessageAt: Date | null;
  /** true, wenn in den letzten 15 Minuten etwas ankam. */
  live: boolean;
}

export function isPublicStatusEnabled(): boolean {
  return (process.env.SHOW_PUBLIC_STATUS ?? "true").toLowerCase() !== "false";
}

export async function getPublicStatus(): Promise<PublicStatus | null> {
  if (!isPublicStatusEnabled()) return null;

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [channelRow, totalRow, dayRow, viewerRow, lastRow] = await Promise.all([
      db.select({ value: count() }).from(channels).where(eq(channels.active, true)),
      db.select({ value: count() }).from(messages),
      db.select({ value: count() }).from(messages).where(gte(messages.receivedAt, since)),
      db.select({ value: count() }).from(viewers),
      db
        .select({ receivedAt: messages.receivedAt })
        .from(messages)
        .orderBy(desc(messages.receivedAt))
        .limit(1),
    ]);

    const lastMessageAt = lastRow[0]?.receivedAt ?? null;

    return {
      channelsActive: channelRow[0]?.value ?? 0,
      messagesTotal: totalRow[0]?.value ?? 0,
      messages24h: dayRow[0]?.value ?? 0,
      viewersTotal: viewerRow[0]?.value ?? 0,
      lastMessageAt,
      live: lastMessageAt ? Date.now() - lastMessageAt.getTime() < 15 * 60 * 1000 : false,
    };
  } catch (error) {
    // Die Anmeldung darf nie an der Statusanzeige scheitern.
    console.error("[public-status] Abfrage fehlgeschlagen:", error);
    return null;
  }
}

/** Nachrichtenaufkommen der letzten 24 Stunden, stundenweise – für die Sparkline. */
export async function getPublicActivity(): Promise<Array<{ hour: string; messages: number }>> {
  if (!isPublicStatusEnabled()) return [];

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        bucket: sql<string>`DATE_FORMAT(${messages.receivedAt}, '%Y-%m-%d %H')`,
        total: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(messages)
      .where(gte(messages.receivedAt, since))
      .groupBy(sql`DATE_FORMAT(${messages.receivedAt}, '%Y-%m-%d %H')`);

    const map = new Map(rows.map((row) => [row.bucket, row.total]));
    const points: Array<{ hour: string; messages: number }> = [];

    const start = new Date(since);
    start.setMinutes(0, 0, 0);

    for (let time = start.getTime(); time <= Date.now(); time += 60 * 60 * 1000) {
      const date = new Date(time);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}`;

      points.push({ hour: date.toISOString(), messages: map.get(key) ?? 0 });
    }

    return points;
  } catch (error) {
    console.error("[public-status] Verlauf fehlgeschlagen:", error);
    return [];
  }
}

import "server-only";
import { gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { getActiveWatchTerms } from "@/lib/queries/watchlist";
import { getCachedViewerAvatars } from "@/lib/twitch-api";
import { buildWatchlistAlertPayload, type WatchlistAlertHit } from "@/lib/discord";
import { findMatches } from "@/lib/watchlist";
import { truncate } from "@/lib/utils";

/**
 * Hintergrund-Polling für Wortfilter-Alerts: schickt einen Discord-Webhook,
 * sobald eine neue Nachricht einen Begriff mit Stufe "kritisch" trifft.
 *
 * Bewusst als Timer statt echtem Event, weil der Bot direkt in die
 * Datenbank schreibt – das Panel bekommt neue Nachrichten nur durch
 * Nachfragen mit. So müssen Mods das Panel nicht offen halten, um
 * benachrichtigt zu werden.
 */

const POLL_INTERVAL_MS = 15_000;
const BATCH_LIMIT = 500;
/** Schutz gegen einen gefluteten Webhook, falls sehr viele Treffer auf einmal ankommen. */
const MAX_ALERTS_PER_CYCLE = 10;

function isAlertingConfigured(): boolean {
  return Boolean(process.env.WATCHLIST_WEBHOOK_URL);
}

interface AlertState {
  lastMessageId: number;
}

const globalForAlerts = globalThis as unknown as {
  __watchlistAlertState?: AlertState;
  __watchlistAlertTimer?: ReturnType<typeof setInterval>;
  __watchlistAlertRunning?: boolean;
};

async function getLatestMessageId(): Promise<number> {
  const [row] = await db.select({ id: sql<number>`MAX(${messages.id})`.mapWith(Number) }).from(messages);
  return row?.id ?? 0;
}

async function sendDiscordAlert(hit: WatchlistAlertHit): Promise<void> {
  const url = process.env.WATCHLIST_WEBHOOK_URL;
  if (!url) return;

  const payload = buildWatchlistAlertPayload(hit, process.env.APP_URL);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    // Discord drosselt Webhooks und antwortet dann mit 429. Ohne diese Pruefung
    // gilt jede Antwort als Erfolg und verworfene Alarme fallen niemandem auf.
    if (!response.ok) {
      console.error(`[watchlist-alerts] Webhook antwortete ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error("[watchlist-alerts] Webhook fehlgeschlagen:", error);
  }
}

/**
 * Ein Durchlauf der Prüfung.
 *
 * Der Aufrufer stellt sicher, dass nie zwei gleichzeitig laufen – siehe
 * `runCycle`. Ohne das verschickt ein langsamer Durchlauf seine Alarme ein
 * zweites Mal, weil der Cursor erst am Ende vorrueckt.
 */
async function checkForCriticalHits(): Promise<void> {
  const state = globalForAlerts.__watchlistAlertState;
  if (!state) return;

  const terms = await getActiveWatchTerms();
  const criticalTerms = terms.filter((term) => term.severity === "critical");

  const rows = await db
    .select({
      id: messages.id,
      channelUuid: messages.channelUuid,
      channelId: messages.channelId,
      channelName: messages.channelName,
      userId: messages.userId,
      userName: messages.userName,
      displayName: messages.displayName,
      content: messages.content,
      receivedAt: messages.receivedAt,
    })
    .from(messages)
    .where(gt(messages.id, state.lastMessageId))
    .orderBy(messages.id)
    .limit(BATCH_LIMIT);

  if (rows.length === 0) return;

  if (criticalTerms.length === 0) {
    state.lastMessageId = rows[rows.length - 1]!.id;
    return;
  }

  // Erst suchen, dann senden. Der Cursor darf nur bis zur letzten Zeile
  // vorruecken, die wirklich geprueft wurde – sonst gehen die Nachrichten
  // hinter der Obergrenze verloren, statt im naechsten Durchlauf dranzukommen.
  const hits: Array<{ row: (typeof rows)[number]; terms: string[] }> = [];
  let lastProcessedId = state.lastMessageId;

  for (const row of rows) {
    if (hits.length >= MAX_ALERTS_PER_CYCLE) break;

    const matches = findMatches(row.content, criticalTerms, row.channelUuid);
    if (matches.length > 0) {
      hits.push({ row, terms: [...new Set(matches.map((match) => match.term))] });
    }

    lastProcessedId = row.id;
  }

  // Avatare gebuendelt statt einzeln je Alarm: das war eine Datenbankabfrage
  // pro Meldung und hat die Durchlaufzeit unnoetig hochgetrieben.
  const avatars = hits.length
    ? await getCachedViewerAvatars(hits.map((hit) => hit.row.userId)).catch(() => new Map())
    : new Map();

  for (const { row, terms: hitTerms } of hits) {
    await sendDiscordAlert({
      channelId: row.channelId,
      channelName: row.channelName,
      userId: row.userId,
      userName: row.userName,
      displayName: row.displayName,
      content: row.content,
      receivedAt: row.receivedAt,
      avatarUrl: avatars.get(row.userId)?.profileImageUrl ?? null,
      terms: hitTerms,
    });
  }

  state.lastMessageId = lastProcessedId;
}

/**
 * Führt einen Durchlauf aus, sofern nicht schon einer läuft.
 *
 * `setInterval` feuert unabhängig davon, ob der vorige Durchlauf fertig ist.
 * Da der Cursor erst am Ende vorrückt, würde ein überlappender Durchlauf
 * dieselben Nachrichten noch einmal lesen und die Alarme doppelt verschicken.
 * Ein übersprungener Takt kostet nichts: der nächste liest ohnehin alles nach.
 */
async function runCycle(): Promise<void> {
  if (globalForAlerts.__watchlistAlertRunning) return;
  globalForAlerts.__watchlistAlertRunning = true;

  try {
    await checkForCriticalHits();
  } catch (error) {
    console.error("[watchlist-alerts] Prüfung fehlgeschlagen:", error);
  } finally {
    globalForAlerts.__watchlistAlertRunning = false;
  }
}

/**
 * Startet das Polling einmalig pro Serverprozess. Der Startpunkt ist die
 * zu diesem Zeitpunkt neueste Nachricht – so löst ein Neustart keine
 * Flut alter Treffer aus.
 */
export function startWatchlistAlertPolling(): void {
  if (!isAlertingConfigured()) return;
  if (globalForAlerts.__watchlistAlertTimer) return;

  void getLatestMessageId()
    .then((latestId) => {
      globalForAlerts.__watchlistAlertState = { lastMessageId: latestId };
    })
    .catch((error) => {
      console.error("[watchlist-alerts] Start fehlgeschlagen:", error);
    });

  globalForAlerts.__watchlistAlertTimer = setInterval(() => {
    void runCycle();
  }, POLL_INTERVAL_MS);
}

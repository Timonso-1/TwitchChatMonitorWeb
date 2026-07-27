import "server-only";
import { gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { getActiveWatchTerms } from "@/lib/queries/watchlist";
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
};

async function getLatestMessageId(): Promise<number> {
  const [row] = await db.select({ id: sql<number>`MAX(${messages.id})`.mapWith(Number) }).from(messages);
  return row?.id ?? 0;
}

async function sendDiscordAlert(hit: {
  channelName: string;
  userId: string;
  userName: string;
  displayName: string | null;
  content: string;
  terms: string[];
}): Promise<void> {
  const url = process.env.WATCHLIST_WEBHOOK_URL;
  if (!url) return;

  const name = hit.displayName ?? hit.userName;
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");

  const payload = {
    embeds: [
      {
        title: "🚨 Kritischer Wortfilter-Treffer",
        description: `**${name}** in **${hit.channelName}**:\n> ${truncate(hit.content, 300)}`,
        color: 0xef4444,
        fields: [
          { name: "Begriff(e)", value: hit.terms.join(", ") || "—", inline: true },
          ...(appUrl ? [{ name: "Profil", value: `${appUrl}/viewers/${hit.userId}`, inline: true }] : []),
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error("[watchlist-alerts] Webhook fehlgeschlagen:", error);
  }
}

async function checkForCriticalHits(): Promise<void> {
  const state = globalForAlerts.__watchlistAlertState;
  if (!state) return;

  const terms = await getActiveWatchTerms();
  const criticalTerms = terms.filter((term) => term.severity === "critical");

  const rows = await db
    .select({
      id: messages.id,
      channelUuid: messages.channelUuid,
      channelName: messages.channelName,
      userId: messages.userId,
      userName: messages.userName,
      displayName: messages.displayName,
      content: messages.content,
    })
    .from(messages)
    .where(gt(messages.id, state.lastMessageId))
    .orderBy(messages.id)
    .limit(BATCH_LIMIT);

  if (rows.length === 0) return;

  let alertsSent = 0;

  if (criticalTerms.length > 0) {
    for (const row of rows) {
      if (alertsSent >= MAX_ALERTS_PER_CYCLE) break;

      const matches = findMatches(row.content, criticalTerms, row.channelUuid);
      if (matches.length === 0) continue;

      await sendDiscordAlert({
        channelName: row.channelName,
        userId: row.userId,
        userName: row.userName,
        displayName: row.displayName,
        content: row.content,
        terms: [...new Set(matches.map((match) => match.term))],
      });
      alertsSent++;
    }
  }

  state.lastMessageId = rows[rows.length - 1]!.id;
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
    void checkForCriticalHits().catch((error) => {
      console.error("[watchlist-alerts] Prüfung fehlgeschlagen:", error);
    });
  }, POLL_INTERVAL_MS);
}

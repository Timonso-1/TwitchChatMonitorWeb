import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";

/**
 * Online-Status des Chat-Bots fürs Dashboard.
 *
 * Zwei Quellen, in dieser Reihenfolge:
 * 1. Uptime Kuma, falls `KUMA_STATUS_URL` gesetzt ist (Heartbeat-JSON einer
 *    Statusseite, z. B. https://status.example.com/api/status-page/heartbeat/<slug>).
 *    Optional wählt `KUMA_MONITOR_ID` den Monitor aus, wenn die Seite mehrere enthält.
 * 2. Sonst (oder wenn Kuma nicht erreichbar ist): Ableitung aus der letzten
 *    empfangenen Chatnachricht – analog zu `getPublicStatus()`.
 *
 * Bewusst config-only: ohne `KUMA_STATUS_URL` wird kein Slug erraten, es
 * wird direkt auf die Datenbank-Ableitung zurückgegriffen.
 */

export interface BotStatus {
  online: boolean;
  source: "kuma" | "inferred";
  lastMessageAt: Date | null;
  /** Nur gesetzt, wenn die Quelle Kuma war. */
  lastHeartbeatAt: Date | null;
}

const INFERRED_ONLINE_WINDOW_MS = 15 * 60 * 1000;
const KUMA_FETCH_TIMEOUT_MS = 4000;

/** Kuma-Heartbeat-Status: 0 = down, 1 = up, 2 = pending, 3 = maintenance. */
interface KumaHeartbeat {
  status: number;
  time: string;
}

interface KumaHeartbeatResponse {
  heartbeatList?: Record<string, KumaHeartbeat[]>;
}

function isKumaConfigured(): boolean {
  return Boolean(process.env.KUMA_STATUS_URL);
}

async function getKumaStatus(): Promise<BotStatus | null> {
  const url = process.env.KUMA_STATUS_URL;
  if (!url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), KUMA_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return null;

    const data = (await response.json()) as KumaHeartbeatResponse;
    const monitorId = process.env.KUMA_MONITOR_ID;
    const heartbeatList = data.heartbeatList ?? {};

    const beats = monitorId ? heartbeatList[monitorId] : Object.values(heartbeatList)[0];
    if (!beats || beats.length === 0) return null;

    const latest = beats[beats.length - 1];

    return {
      online: latest.status === 1,
      source: "kuma",
      lastMessageAt: null,
      lastHeartbeatAt: new Date(latest.time),
    };
  } catch {
    // Kuma nicht erreichbar oder falsch konfiguriert – lautlos auf DB-Ableitung zurückfallen.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getInferredStatus(): Promise<BotStatus> {
  const [lastRow] = await db
    .select({ receivedAt: messages.receivedAt })
    .from(messages)
    .orderBy(desc(messages.receivedAt))
    .limit(1);

  const lastMessageAt = lastRow?.receivedAt ?? null;

  return {
    online: lastMessageAt ? Date.now() - lastMessageAt.getTime() < INFERRED_ONLINE_WINDOW_MS : false,
    source: "inferred",
    lastMessageAt,
    lastHeartbeatAt: null,
  };
}

export async function getBotStatus(): Promise<BotStatus> {
  try {
    if (isKumaConfigured()) {
      const kuma = await getKumaStatus();
      if (kuma) return kuma;
    }

    return await getInferredStatus();
  } catch (error) {
    // Das Dashboard darf nie an der Statusanzeige scheitern.
    console.error("[bot-status] Abfrage fehlgeschlagen:", error);
    return { online: false, source: "inferred", lastMessageAt: null, lastHeartbeatAt: null };
  }
}

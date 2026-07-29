/**
 * Hilfen für Discord-Webhooks.
 *
 * Bewusst ohne Server- und Datenbankabhängigkeiten, damit die Umwandlung ohne
 * Verbindungspool prüfbar bleibt.
 */

import { truncate } from "@/lib/utils";

/**
 * Neutralisiert Discord-Markdown, damit ein Chattext so ankommt, wie er
 * geschrieben wurde.
 *
 * Ohne das könnte jemand seine Nachricht in der Alarmmeldung verstellen – mit
 * Spoiler-Balken unlesbar machen, mit Codeblöcken Zeilen verschlucken oder
 * Teile fett setzen. In einer Moderationsmeldung soll aber genau das stehen,
 * was gesagt wurde.
 *
 * Der Backslash muss zuerst in der Zeichenklasse stehen, sonst maskiert die
 * Funktion die eigenen Maskierungen ein zweites Mal.
 */
export function escapeDiscordMarkdown(text: string): string {
  return text.replace(/([\\*_~`|])/g, "\\$1");
}

export interface WatchlistAlertHit {
  channelId: string;
  channelName: string;
  userId: string;
  userName: string;
  displayName: string | null;
  content: string;
  receivedAt: Date;
  avatarUrl: string | null;
  terms: string[];
}

/** Discord kappt längere Beschreibungen; hier bleibt der Auszug bewusst kurz. */
const CONTENT_LIMIT = 300;

/**
 * Baut die Webhook-Nutzlast für einen kritischen Wortfilter-Treffer.
 *
 * Getrennt vom Versand, damit sich Aufbau, Maskierung und Verlinkung ohne
 * Netzwerk und ohne echten Discord-Server prüfen lassen.
 *
 * Ohne `appUrl` entfallen die Panel-Links; die Twitch-Links stehen immer, sie
 * brauchen keine Konfiguration.
 */
export function buildWatchlistAlertPayload(hit: WatchlistAlertHit, appUrl?: string) {
  const base = appUrl?.replace(/\/$/, "");
  const name = hit.displayName ?? hit.userName;

  const profileUrl = base ? `${base}/viewers/${encodeURIComponent(hit.userId)}` : null;
  const messagesUrl = base
    ? `${base}/messages?channel=${encodeURIComponent(hit.channelId)}&user=${encodeURIComponent(hit.userName)}`
    : null;

  const twitchUser = `https://twitch.tv/${encodeURIComponent(hit.userName)}`;
  const twitchChannel = `https://twitch.tv/${encodeURIComponent(hit.channelName)}`;

  // Aufbau als Protokolleintrag: beschriftete Felder untereinander statt
  // Fliesstext. Jede Angabe steht unter ihrer Überschrift und ist damit auch
  // Wochen spaeter noch zuzuordnen.
  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    {
      name: "Nachricht",
      // > zitiert die Zeile; der Text ist auf CONTENT_LIMIT gekuerzt und
      // maskiert, kann also keine eigenen Zeilenumbrueche einschleusen.
      value: `> ${escapeDiscordMarkdown(truncate(hit.content, CONTENT_LIMIT)).replace(/\n/g, "\n> ")}`,
      inline: false,
    },
    {
      name: "Begriff(e)",
      value: hit.terms.map((term) => `\`${escapeDiscordMarkdown(term)}\``).join(", ") || "—",
      inline: true,
    },
    {
      name: "Channel",
      value: `[${escapeDiscordMarkdown(hit.channelName)}](${twitchChannel})`,
      inline: true,
    },
    {
      name: "Zuschauer",
      value: `[${escapeDiscordMarkdown(name)}](${twitchUser})`,
      inline: true,
    },
  ];

  if (profileUrl) fields.push({ name: "Profil", value: profileUrl, inline: false });
  if (messagesUrl) fields.push({ name: "Nachrichten im Channel", value: messagesUrl, inline: false });

  return {
    embeds: [
      {
        author: {
          name: `${name} (@${hit.userName})`,
          ...(hit.avatarUrl ? { icon_url: hit.avatarUrl } : {}),
          // Der Autorenname fuehrt ins Panel, wo die Moderation weiterarbeitet.
          ...(profileUrl ? { url: profileUrl } : {}),
        },
        title: "🚨 Kritischer Wortfilter-Treffer",
        ...(profileUrl ? { url: profileUrl } : {}),
        color: 0xef4444,
        fields,
        footer: { text: "TwitchPanel · Wortfilter" },
        // Zeitpunkt der Nachricht, nicht des Versands: das Polling laeuft alle
        // 15 Sekunden und kann bei Rueckstau deutlich spaeter dran sein.
        timestamp: hit.receivedAt.toISOString(),
      },
    ],
    // Verhindert, dass ein "@everyone" aus dem Chat den Discord-Server pingt.
    allowed_mentions: { parse: [] as string[] },
  };
}

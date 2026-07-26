/**
 * Auswertung der Twitch-IRC-Tags, die der Bot roh mitspeichert.
 *
 * Die Formate stammen aus dem IRC-Protokoll und sind nicht selbsterklärend –
 * deshalb liegt die gesamte Parserei hier gebündelt, samt Beispielen.
 */

// ---------------------------------------------------------------------------
// Emotes
// ---------------------------------------------------------------------------

/**
 * Twitch liefert Emotes als `emoteId:start-end,start-end/emoteId:start-end`,
 * zum Beispiel `25:0-4,12-16/1902:6-10`.
 *
 * Die Positionen zählen in Unicode-Codepoints, nicht in UTF-16-Einheiten –
 * bei Emojis im Text würde eine einfache `slice`-Zählung verrutschen.
 * Der Emote-NAME steht nicht im Tag, er muss aus dem Text geschnitten werden.
 */
export interface ParsedEmote {
  id: string;
  /** Aus dem Nachrichtentext geschnittener Name, z. B. "Kappa". */
  name: string;
  /** Wie oft dieses Emote in der Nachricht vorkommt. */
  count: number;
  positions: Array<{ start: number; end: number }>;
}

export function parseEmotes(raw: string | null | undefined, content: string): ParsedEmote[] {
  if (!raw || raw.trim().length === 0) return [];

  // Manche Bots speichern das Tag als JSON – dann greift der Fallback weiter unten.
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return parseEmotesJson(trimmed);
  }

  // Codepoint-Array, damit die Positionen auch mit Emojis stimmen.
  const characters = [...content];
  const result: ParsedEmote[] = [];

  for (const group of trimmed.split("/")) {
    const [id, rangePart] = group.split(":");
    if (!id || !rangePart) continue;

    const positions: Array<{ start: number; end: number }> = [];

    for (const range of rangePart.split(",")) {
      const [startRaw, endRaw] = range.split("-");
      const start = Number(startRaw);
      const end = Number(endRaw);

      if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
      positions.push({ start, end });
    }

    if (positions.length === 0) continue;

    // Der Name ist bei allen Vorkommen gleich – das erste reicht.
    const first = positions[0];
    const name = characters.slice(first.start, first.end + 1).join("");

    result.push({
      id,
      name: name || `Emote ${id}`,
      count: positions.length,
      positions,
    });
  }

  return result;
}

/** Fallback, falls der Bot die Emotes bereits als JSON ablegt. */
function parseEmotesJson(raw: string): ParsedEmote[] {
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];

    // Der Rückgabetyp muss annotiert werden, sonst leitet TypeScript
    // `positions: []` als `never[]` ab und der Filter unten schlägt fehl.
    return data
      .map((entry): ParsedEmote | null => {
        const item = entry as { id?: string; name?: string; count?: number };
        if (!item.id && !item.name) return null;

        return {
          id: String(item.id ?? item.name),
          name: String(item.name ?? item.id),
          count: Number(item.count ?? 1),
          positions: [],
        };
      })
      .filter((entry): entry is ParsedEmote => entry !== null);
  } catch {
    return [];
  }
}

/** Gesamtzahl der Emotes in einer Nachricht. */
export function countEmotes(raw: string | null | undefined, content: string): number {
  return parseEmotes(raw, content).reduce((sum, emote) => sum + emote.count, 0);
}

/**
 * Anteil der Nachricht, der aus Emotes besteht (0 bis 1).
 * Nützlich, um reine Emote-Spam-Nachrichten zu erkennen.
 */
export function emoteRatio(raw: string | null | undefined, content: string): number {
  const emotes = parseEmotes(raw, content);
  if (emotes.length === 0) return 0;

  const characters = [...content].length;
  if (characters === 0) return 0;

  const emoteCharacters = emotes.reduce(
    (sum, emote) => sum + emote.positions.reduce((inner, pos) => inner + (pos.end - pos.start + 1), 0),
    0,
  );

  return Math.min(1, emoteCharacters / characters);
}

/** URL zum Emote-Bild auf Twitchs CDN. */
export function emoteImageUrl(id: string, size: "1.0" | "2.0" | "3.0" = "1.0"): string {
  return `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/${size}`;
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

/**
 * `badges` sieht aus wie `moderator/1,subscriber/12`,
 * `badge_info` wie `subscriber/24` – dort steht bei Abonnenten die
 * tatsächliche Anzahl der Monate, während `badges` nur die Abzeichen-Stufe nennt.
 */
export function parseBadgePairs(raw: string | null | undefined): Map<string, string> {
  const result = new Map<string, string>();
  if (!raw) return result;

  for (const entry of raw.split(",")) {
    const [name, value = ""] = entry.trim().split("/");
    if (name) result.set(name.toLowerCase(), value);
  }

  return result;
}

/**
 * Liest die tatsächliche Abo-Dauer aus `badge_info`.
 * Gibt null zurück, wenn der Nutzer zum Zeitpunkt der Nachricht kein Abo hatte.
 */
export function subscriberMonths(badgeInfo: string | null | undefined): number | null {
  const pairs = parseBadgePairs(badgeInfo);
  const value = pairs.get("subscriber") ?? pairs.get("founder");
  if (!value) return null;

  const months = Number(value);
  return Number.isInteger(months) && months > 0 ? months : null;
}

/** Gründer-Abzeichen: war von Anfang an dabei. */
export function isFounder(badges: string | null | undefined): boolean {
  return parseBadgePairs(badges).has("founder");
}

const BADGE_LABELS: Record<string, string> = {
  broadcaster: "Broadcaster",
  moderator: "Moderator",
  vip: "VIP",
  subscriber: "Subscriber",
  founder: "Gründer",
  premium: "Prime",
  turbo: "Turbo",
  partner: "Partner",
  staff: "Twitch-Team",
  admin: "Twitch-Admin",
  "global_mod": "Globaler Mod",
  "bits-leader": "Bits-Spitzenreiter",
  bits: "Bits",
  "sub-gifter": "Abo-Schenker",
  "sub-gift-leader": "Schenker-Spitzenreiter",
  "hype-train": "Hype-Train",
  "predictions": "Vorhersage",
  "no_audio": "Ohne Ton",
  "no_video": "Ohne Bild",
  artist: "Kanalkünstler",
  moments: "Moment",
};

export function badgeLabel(name: string): string {
  return BADGE_LABELS[name.toLowerCase()] ?? name;
}

export interface ParsedBadge {
  name: string;
  label: string;
  version: string;
  /** Bei Abonnenten die Monatszahl aus badge_info. */
  months: number | null;
}

/** Verbindet `badges` und `badge_info` zu einer Liste für die Anzeige. */
export function parseBadges(badges: string | null | undefined, badgeInfo?: string | null): ParsedBadge[] {
  const info = parseBadgePairs(badgeInfo);

  return [...parseBadgePairs(badges).entries()].map(([name, version]) => {
    const infoValue = info.get(name);
    const months = infoValue ? Number(infoValue) : null;

    return {
      name,
      label: badgeLabel(name),
      version,
      months: Number.isInteger(months) && months !== null && months > 0 ? months : null,
    };
  });
}

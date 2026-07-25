/**
 * Aufbereitung der Twitch-Rohwerte fuer die Anzeige.
 * Bewusst frei von Node- und Server-Abhaengigkeiten, damit die Helfer
 * auch in Client-Komponenten verwendet werden koennen.
 */

export type SubTier = "prime" | "1" | "2" | "3" | "unknown";

/**
 * Twitch liefert Abo-Stufen als "1000", "2000", "3000" bzw. "Prime"
 * (IRC-Tag `msg-param-sub-plan`, EventSub-Feld `tier`).
 * Diese Rohwerte werden hier auf die vier tatsaechlichen Stufen abgebildet.
 */
export function normalizeSubTier(raw: string | null | undefined): SubTier {
  if (!raw) return "unknown";

  const value = raw.trim().toLowerCase();

  if (value === "prime") return "prime";
  if (value === "1000" || value === "1") return "1";
  if (value === "2000" || value === "2") return "2";
  if (value === "3000" || value === "3") return "3";

  return "unknown";
}

const SUB_TIER_LABELS: Record<SubTier, string> = {
  prime: "Prime",
  "1": "Tier 1",
  "2": "Tier 2",
  "3": "Tier 3",
  unknown: "—",
};

/** Kurzform fuer die Anzeige, z. B. "Tier 2" oder "Prime". */
export function subTierLabel(raw: string | null | undefined): string {
  return SUB_TIER_LABELS[normalizeSubTier(raw)];
}

/** Farbwert je Stufe, angelehnt an die Twitch-Abzeichen. */
export const SUB_TIER_COLORS: Record<SubTier, string> = {
  prime: "#00a4dc",
  "1": "#9147ff",
  "2": "#e6a700",
  "3": "#ff6b35",
  unknown: "#71717a",
};

/** Alle auswaehlbaren Stufen fuer Filter-Dropdowns. */
export const SUB_TIER_OPTIONS: Array<{ value: Exclude<SubTier, "unknown">; label: string }> = [
  { value: "prime", label: "Prime" },
  { value: "1", label: "Tier 1" },
  { value: "2", label: "Tier 2" },
  { value: "3", label: "Tier 3" },
];

/**
 * Liefert die Rohwerte, die zu einer Stufe passen – noetig fuer
 * Datenbankfilter, weil dort noch "1000" statt "1" steht.
 */
export function subTierRawValues(tier: Exclude<SubTier, "unknown">): string[] {
  switch (tier) {
    case "prime":
      return ["Prime", "prime"];
    case "1":
      return ["1000", "1"];
    case "2":
      return ["2000", "2"];
    case "3":
      return ["3000", "3"];
  }
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  sub: "Abo",
  subscribe: "Abo",
  subscription: "Abo",
  resub: "Wiederholungs-Abo",
  subgift: "Abo geschenkt",
  submysterygift: "Abo-Bombe",
  giftpaidupgrade: "Geschenk-Upgrade",
  anongiftpaidupgrade: "Geschenk-Upgrade",
  primepaidupgrade: "Prime-Upgrade",
  raid: "Raid",
  unraid: "Raid abgebrochen",
  host: "Host",
  cheer: "Cheer",
  bits: "Bits",
  follow: "Follow",
  hypetrain: "Hype-Train",
  redemption: "Kanalpunkte",
  poll: "Umfrage",
  prediction: "Vorhersage",
  streamup: "Stream gestartet",
  streamdown: "Stream beendet",
  ritual: "Ritual",
  bitsbadgetier: "Bits-Abzeichen",
};

export function eventTypeLabel(type: string): string {
  return EVENT_TYPE_LABELS[type.toLowerCase()] ?? type;
}

const MODERATION_ACTION_LABELS: Record<string, string> = {
  ban: "Bann",
  unban: "Entbannt",
  timeout: "Timeout",
  untimeout: "Timeout aufgehoben",
  delete: "Nachricht gelöscht",
  clear: "Chat geleert",
  warn: "Verwarnung",
  slow: "Slow-Mode",
  slowoff: "Slow-Mode aus",
  followers: "Follower-Mode",
  followersoff: "Follower-Mode aus",
  subscribers: "Sub-Mode",
  subscribersoff: "Sub-Mode aus",
  emoteonly: "Emote-Only",
  emoteonlyoff: "Emote-Only aus",
  uniquechat: "Unique-Chat",
  raid: "Raid",
};

export function moderationActionLabel(action: string): string {
  return MODERATION_ACTION_LABELS[action.toLowerCase()] ?? action;
}

/** Formatiert eine Timeout-Dauer in Sekunden lesbar. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86_400)} Tage`;
}

/**
 * Baut aus den Rohfeldern eines Events eine lesbare Beschreibung,
 * z. B. "Tier 2 · 14 Monate · von Mister_alp".
 */
export function eventDetailText(event: {
  subTier?: string | null;
  months?: number | null;
  giftCount?: number | null;
  viewerCount?: number | null;
  giftedByName?: string | null;
}): string {
  const parts: string[] = [];
  const formatter = new Intl.NumberFormat("de-DE");

  const tier = normalizeSubTier(event.subTier);
  if (tier !== "unknown") parts.push(SUB_TIER_LABELS[tier]);
  if (event.months) parts.push(`${formatter.format(event.months)} Monate`);
  if (event.giftCount) parts.push(`${formatter.format(event.giftCount)} Geschenke`);
  if (event.viewerCount) parts.push(`${formatter.format(event.viewerCount)} Zuschauer`);
  if (event.giftedByName) parts.push(`von ${event.giftedByName}`);

  return parts.length > 0 ? parts.join(" · ") : "—";
}

// ---------------------------------------------------------------------------
// Chatfarben
// ---------------------------------------------------------------------------

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(color: string): Rgb | null {
  const value = color.trim().replace(/^#/, "");

  const expanded =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;

  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const part = (value: number) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** Relative Luminanz nach WCAG – 0 = schwarz, 1 = weiss. */
export function relativeLuminance(color: string): number | null {
  const rgb = parseHex(color);
  if (!rgb) return null;

  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/**
 * Dunkelt eine Farbe so weit ab, dass sie auf hellem Hintergrund lesbar bleibt.
 * Twitch erlaubt sehr helle Chatfarben, die auf Weiss praktisch verschwinden.
 */
export function darkenForLightBackground(color: string, targetLuminance = 0.22): string | null {
  const rgb = parseHex(color);
  if (!rgb) return null;

  const luminance = relativeLuminance(color);
  if (luminance === null) return null;
  if (luminance <= targetLuminance) return toHex(rgb);

  // Schrittweise abdunkeln, bis die Ziel-Luminanz erreicht ist.
  let factor = 1;
  let current = { ...rgb };

  for (let step = 0; step < 24; step++) {
    factor -= 0.05;
    current = { r: rgb.r * factor, g: rgb.g * factor, b: rgb.b * factor };

    const next = relativeLuminance(toHex(current));
    if (next !== null && next <= targetLuminance) break;
  }

  return toHex(current);
}

export interface ChatColorPair {
  /** Originalfarbe – gut lesbar auf dunklem Hintergrund. */
  dark: string;
  /** Abgedunkelte Variante fuer den hellen Modus. */
  light: string;
}

/**
 * Liefert beide Varianten einer Chatfarbe.
 * Die Auswahl passiert per CSS, weil der Server das aktive Theme
 * bei der Einstellung "System" nicht kennt.
 */
export function chatColorPair(color: string | null | undefined): ChatColorPair | null {
  if (!color) return null;

  const rgb = parseHex(color);
  if (!rgb) return null;

  const dark = toHex(rgb);
  return { dark, light: darkenForLightBackground(dark) ?? dark };
}

/** Parst das `badges`-Feld ("moderator/1,subscriber/12") in einzelne Abzeichen. */
export function parseBadges(raw: string | null | undefined): Array<{ name: string; version: string }> {
  if (!raw) return [];

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, version = ""] = entry.split("/");
      return { name, version };
    });
}

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Europe/Berlin",
});

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeZone: "Europe/Berlin",
});

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(diffSeconds);

  const rtf = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });
  if (absolute < 60) return rtf.format(diffSeconds, "second");
  if (absolute < 3600) return rtf.format(Math.round(diffSeconds / 60), "minute");
  if (absolute < 86400) return rtf.format(Math.round(diffSeconds / 3600), "hour");
  if (absolute < 2592000) return rtf.format(Math.round(diffSeconds / 86400), "day");
  if (absolute < 31536000) return rtf.format(Math.round(diffSeconds / 2592000), "month");
  return rtf.format(Math.round(diffSeconds / 31536000), "year");
}

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat("de-DE").format(num);
}

/** Kompakte Zahl für Achsenbeschriftungen: 12.400 → "12,4 Tsd." */
export function formatCompact(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "—";

  return new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 1 }).format(num);
}

const navCountFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/**
 * Sehr kompakte Zahl für die Seitenleiste: 847 → "847", 12.400 → "12,4k",
 * 1.200.000 → "1,2M".
 *
 * Bewusst kürzer als {@link formatCompact} ("12,4 Tsd."), weil in der 240 px
 * breiten Seitenleiste neben Icon und Beschriftung kaum Platz bleibt.
 */
export function formatNavCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";

  const total = Math.floor(value);
  if (total < 1_000) return String(total);

  // Erst auf eine Nachkommastelle runden, dann die Einheit wählen – sonst wird
  // aus 999.999 fälschlich "1000k" statt "1M".
  const thousands = Math.round(total / 100) / 10;
  if (thousands < 1_000) return `${navCountFormatter.format(thousands)}k`;

  return `${navCountFormatter.format(Math.round(total / 100_000) / 10)}M`;
}

/**
 * Mindestgröße der Vergleichsbasis. Darunter sind Prozentwerte irreführend:
 * von 2 auf 20 sind zwar +900 %, sagen aber nichts aus.
 */
export const MIN_TREND_BASE = 10;

/**
 * Prozentuale Veränderung zweier Werte.
 * Gibt null zurück, wenn die Basis zu klein für eine sinnvolle Aussage ist.
 */
export function percentChange(current: number, previous: number, minBase = MIN_TREND_BASE): number | null {
  if (previous < minBase) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Kürzt einen String auf max. `length` Zeichen. */
export function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

/** Liest einen Query-Parameter als positive Ganzzahl mit Fallback. */
export function parsePositiveInt(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

/** Liest einen Query-Parameter als getrimmten String, leere Werte werden zu undefined. */
export function parseSearchParam(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Baut eine Query-String-Repräsentation ohne leere Werte. */
export function buildQueryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const result = search.toString();
  return result.length > 0 ? `?${result}` : "";
}

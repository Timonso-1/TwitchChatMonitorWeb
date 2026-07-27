/**
 * Zeitraumwahl für alle Auswertungsseiten.
 *
 * Ein Zeitraum steckt vollständig in der URL: `range=30` für einen Vorgabewert
 * oder `range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD` für einen freien Zeitraum.
 * Der aufgelöste Zeitraum steuert sowohl das Diagramm als auch die Tabelle der
 * jeweiligen Seite – es gibt bewusst nur eine Zeitangabe pro Seite.
 *
 * Alle Berechnungen laufen in der Zeitzone des Servers, genau wie das Schreiben
 * der Bot-Daten und die Datumsfilter der Abfragen.
 */

export const CUSTOM_RANGE = "custom";

export interface RangePreset {
  /** Wert des Query-Parameters `range`. */
  value: number;
  /** Länge des Zeitraums in Tagen. */
  days: number;
  label: string;
}

/** Vollständiger Satz an Vorgaben. Seiten wählen daraus eine Teilmenge. */
export const RANGE_PRESETS = [
  { value: 1, days: 1, label: "24 Stunden" },
  { value: 7, days: 7, label: "7 Tage" },
  { value: 30, days: 30, label: "30 Tage" },
  { value: 90, days: 90, label: "90 Tage" },
  { value: 365, days: 365, label: "12 Monate" },
] as const satisfies ReadonlyArray<RangePreset>;

/** Vorgaben der Listenseiten (Nachrichten, Events, Moderation, Zuschauer). */
export const TREND_PRESETS: readonly RangePreset[] = RANGE_PRESETS.filter((preset) => preset.days >= 7);

/** Vorgaben der Übersicht – dort ist der Tagesverlauf interessant. */
export const DASHBOARD_PRESETS: readonly RangePreset[] = RANGE_PRESETS.filter((preset) => preset.days <= 90);

/**
 * "Alles" als Vorgabe, für Seiten ohne Verlaufsdiagramm.
 *
 * Bewusst NICHT in den anderen Listen: ein Diagramm müsste sonst Tagespunkte
 * ab 1970 aufbauen. Der Wert 0 wird in `resolvePreset` gesondert behandelt.
 */
export const ALL_TIME_PRESET: RangePreset = { value: 0, days: 0, label: "Gesamter Zeitraum" };

/** Vorgaben der Trefferliste des Wortfilters. */
export const HITS_PRESETS: readonly RangePreset[] = [...TREND_PRESETS, ALL_TIME_PRESET];

/** Obergrenze eines freien Zeitraums. Schützt vor versehentlich riesigen Abfragen. */
const MAX_CUSTOM_DAYS = 366 * 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ResolvedRange {
  /** Aktive Auswahl: die Tageszahl einer Vorgabe oder "custom". */
  key: number | typeof CUSTOM_RANGE;
  /** Beginn des Zeitraums (Tagesanfang). */
  start: Date;
  /** Ende des Zeitraums – bei Vorgaben "jetzt", bei freier Wahl das Tagesende. */
  end: Date;
  /** Länge in ganzen Tagen. Grundlage für Vergleichsperiode und Achsenraster. */
  days: number;
  /** Beginn des gleich langen Zeitraums direkt davor. */
  previousStart: Date;
  label: string;
  isCustom: boolean;
  /** true, wenn stündlich statt täglich gruppiert werden soll. */
  hourly: boolean;
  /**
   * Datumsgrenzen als `YYYY-MM-DD` – so erwarten die Abfragefilter
   * in `lib/queries` ihre Werte.
   */
  fromDate: string;
  toDate: string;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

export function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Liest ein `YYYY-MM-DD` aus einem Formular oder der URL. */
function parseDateInput(value: unknown): Date | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));

  // Fängt Eingaben wie 2026-02-31 ab, die JavaScript stillschweigend umrechnet.
  if (date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;

  return startOfDay(date);
}

const customLabelFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function customLabel(start: Date, end: Date): string {
  const from = customLabelFormatter.format(start);
  const to = customLabelFormatter.format(end);
  return from === to ? from : `${from} – ${to}`;
}

function resolvePreset(preset: RangePreset): ResolvedRange {
  const end = new Date();

  // days = 0 bedeutet "alles" – dann gibt es keine untere Grenze und
  // folglich auch keine sinnvolle Vergleichsperiode.
  const start = preset.days === 0 ? new Date(0) : startOfDay(new Date(Date.now() - preset.days * DAY_MS));

  return {
    key: preset.value,
    start,
    end,
    days: preset.days,
    previousStart: preset.days === 0 ? new Date(0) : startOfDay(new Date(start.getTime() - preset.days * DAY_MS)),
    label: preset.label,
    isCustom: false,
    hourly: preset.days === 1,
    fromDate: toDateInput(start),
    toDate: toDateInput(end),
  };
}

export interface ResolveRangeOptions {
  /** Erlaubte Vorgaben dieser Seite. */
  presets?: readonly RangePreset[];
  /** Vorgabe, wenn `range` fehlt oder unbekannt ist. */
  fallbackDays?: number;
}

/**
 * Löst die Query-Parameter einer Seite in einen konkreten Zeitraum auf.
 * Unbekannte oder unvollständige Angaben fallen stillschweigend auf die
 * Vorgabe zurück – eine kaputte URL soll keine Fehlerseite erzeugen.
 */
export function resolveRange(
  params: Record<string, string | string[] | undefined>,
  options: ResolveRangeOptions = {},
): ResolvedRange {
  const presets = options.presets ?? TREND_PRESETS;
  const fallbackDays = options.fallbackDays ?? 30;

  const fallback =
    presets.find((preset) => preset.days === fallbackDays) ?? presets[presets.length - 1] ?? RANGE_PRESETS[2];

  const raw = Array.isArray(params.range) ? params.range[0] : params.range;

  if (raw === CUSTOM_RANGE) {
    const custom = resolveCustom(params.from, params.to);
    if (custom) return custom;
    return resolvePreset(fallback);
  }

  const parsed = Number(raw);
  const preset = presets.find((entry) => entry.value === parsed);

  return resolvePreset(preset ?? fallback);
}

/** Baut einen freien Zeitraum. Gibt null zurück, wenn die Angaben unbrauchbar sind. */
function resolveCustom(fromParam: unknown, toParam: unknown): ResolvedRange | null {
  let from = parseDateInput(fromParam);
  let to = parseDateInput(toParam);

  // Eine offene Grenze ist erlaubt: die andere Seite bleibt dann "bis heute"
  // bzw. "ab diesem Tag".
  if (!from && !to) return null;
  if (!from) from = to;
  if (!to) to = startOfDay(new Date());
  if (!from || !to) return null;

  // Vertauschte Grenzen sind ein Tippfehler, kein Fehlerfall.
  if (from.getTime() > to.getTime()) [from, to] = [to, from];

  const start = from;
  const end = endOfDay(to);

  const days = Math.min(Math.max(Math.round((end.getTime() - start.getTime()) / DAY_MS), 1), MAX_CUSTOM_DAYS);

  return {
    key: CUSTOM_RANGE,
    start,
    end,
    days,
    previousStart: startOfDay(new Date(start.getTime() - days * DAY_MS)),
    label: customLabel(start, to),
    isCustom: true,
    hourly: days <= 1,
    fromDate: toDateInput(start),
    toDate: toDateInput(to),
  };
}

/**
 * Query-Parameter, die den Zeitraum in Links weitertragen –
 * für Pagination, Exporte und Filterformulare.
 */
export function rangeParams(range: ResolvedRange): { range: string; from?: string; to?: string } {
  if (!range.isCustom) return { range: String(range.key) };
  return { range: CUSTOM_RANGE, from: range.fromDate, to: range.toDate };
}

/**
 * Beschreibt den Zeitraum für Fließtext: "den letzten 30 Tagen" bzw.
 * "dem Zeitraum 01.06.2026 – 26.07.2026".
 */
export function rangeSentence(range: ResolvedRange): string {
  if (range.isCustom) return `dem Zeitraum ${range.label}`;

  // Vorgabelabels stehen im Nominativ ("7 Tage"); im Satz brauchen wir den Dativ.
  const declined = range.label
    .toLowerCase()
    .replace(/(\d+)\s+tage\b/, "$1 Tagen")
    .replace(/(\d+)\s+monate\b/, "$1 Monaten");

  return `den letzten ${declined}`;
}

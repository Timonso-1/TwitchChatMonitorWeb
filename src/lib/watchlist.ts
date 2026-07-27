/**
 * Wortfilter: Erkennung beobachteter Begriffe in Chatnachrichten.
 * Bewusst frei von Server-Abhängigkeiten, damit die Hervorhebung
 * auch in Client-Komponenten funktioniert.
 */

export const MATCH_TYPES = [
  { value: "contains", label: "Enthält", hint: "Trifft überall im Text, auch innerhalb von Wörtern" },
  { value: "word", label: "Ganzes Wort", hint: "Trifft nur als eigenständiges Wort" },
  { value: "regex", label: "Regulärer Ausdruck", hint: "Für Fortgeschrittene – ungültige Muster werden übersprungen" },
] as const;

export type MatchType = (typeof MATCH_TYPES)[number]["value"];

export const TERM_SEVERITIES = [
  { value: "info", label: "Hinweis" },
  { value: "warning", label: "Warnung" },
  { value: "critical", label: "Kritisch" },
] as const;

export type TermSeverity = (typeof TERM_SEVERITIES)[number]["value"];

export const SEVERITY_STYLES: Record<
  string,
  { badge: "muted" | "warning" | "destructive"; label: string; mark: string }
> = {
  info: {
    badge: "muted",
    label: "Hinweis",
    mark: "bg-[color-mix(in_srgb,var(--color-info)_28%,transparent)] text-[var(--color-foreground)]",
  },
  warning: {
    badge: "warning",
    label: "Warnung",
    mark: "bg-[color-mix(in_srgb,var(--color-warning)_32%,transparent)] text-[var(--color-foreground)]",
  },
  critical: {
    badge: "destructive",
    label: "Kritisch",
    mark: "bg-[color-mix(in_srgb,var(--color-destructive)_32%,transparent)] text-[var(--color-foreground)]",
  },
};

export function severityStyle(severity: string) {
  return SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.warning;
}

export interface WatchTermLike {
  id: number;
  term: string;
  matchType: string;
  severity: string;
  caseSensitive: boolean;
  /** Nur dieser Channel; null = alle. */
  channelUuid?: string | null;
}

export interface TermMatch {
  termId: number;
  term: string;
  severity: string;
  /** Zeichenposition im Text. */
  start: number;
  end: number;
}

/** Maskiert Sonderzeichen, damit ein Begriff wörtlich gesucht wird. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Baut den regulären Ausdruck zu einem Begriff.
 * Gibt null zurück, wenn ein selbst geschriebenes Muster ungültig ist –
 * ein Tippfehler in der Verwaltung darf die Chatansicht nicht lahmlegen.
 */
export function buildTermPattern(term: WatchTermLike): RegExp | null {
  const flags = term.caseSensitive ? "g" : "gi";

  try {
    switch (term.matchType) {
      case "regex":
        return new RegExp(term.term, flags);
      case "word":
        // \b funktioniert nur bei Wortzeichen; bei Sonderzeichen fällt es auf "enthält" zurück.
        return /^\w/.test(term.term) && /\w$/.test(term.term)
          ? new RegExp(`\\b${escapeRegex(term.term)}\\b`, flags)
          : new RegExp(escapeRegex(term.term), flags);
      default:
        return new RegExp(escapeRegex(term.term), flags);
    }
  } catch {
    return null;
  }
}

/** Findet alle Treffer in einem Text, ohne Überschneidungen. */
export function findMatches(content: string, terms: WatchTermLike[], channelUuid?: string): TermMatch[] {
  const matches: TermMatch[] = [];

  for (const term of terms) {
    // Begriffe mit Channel-Bindung gelten nur dort.
    if (term.channelUuid && channelUuid && term.channelUuid !== channelUuid) continue;

    const pattern = buildTermPattern(term);
    if (!pattern) continue;

    // Endlosschleife bei leeren Treffern vermeiden.
    let guard = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null && guard < 100) {
      guard++;
      if (match[0].length === 0) {
        pattern.lastIndex++;
        continue;
      }

      matches.push({
        termId: term.id,
        term: term.term,
        severity: term.severity,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // Nach Position sortieren und Überschneidungen entfernen –
  // sonst würde die Hervorhebung verschachtelte Bereiche erzeugen.
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  const result: TermMatch[] = [];
  let lastEnd = -1;

  for (const match of matches) {
    if (match.start >= lastEnd) {
      result.push(match);
      lastEnd = match.end;
    }
  }

  return result;
}

export interface TextSegment {
  text: string;
  match?: TermMatch;
}

/** Zerlegt einen Text in normale und hervorzuhebende Abschnitte. */
export function splitByMatches(content: string, matches: TermMatch[]): TextSegment[] {
  if (matches.length === 0) return [{ text: content }];

  const segments: TextSegment[] = [];
  let position = 0;

  for (const match of matches) {
    if (match.start > position) {
      segments.push({ text: content.slice(position, match.start) });
    }
    segments.push({ text: content.slice(match.start, match.end), match });
    position = match.end;
  }

  if (position < content.length) {
    segments.push({ text: content.slice(position) });
  }

  return segments;
}

/** Höchste Stufe unter den Treffern – bestimmt die Kennzeichnung der Nachricht. */
export function highestSeverity(matches: TermMatch[]): TermSeverity | null {
  if (matches.length === 0) return null;
  if (matches.some((match) => match.severity === "critical")) return "critical";
  if (matches.some((match) => match.severity === "warning")) return "warning";
  return "info";
}

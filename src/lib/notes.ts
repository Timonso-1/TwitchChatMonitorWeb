/**
 * Konstanten rund um Zuschauer-Notizen.
 * Bewusst getrennt von den Server Actions, weil eine `"use server"`-Datei
 * ausschliesslich asynchrone Funktionen exportieren darf.
 */

export const NOTE_SEVERITIES = [
  { value: "info", label: "Hinweis" },
  { value: "warning", label: "Warnung" },
  { value: "critical", label: "Kritisch" },
] as const;

export type NoteSeverity = (typeof NOTE_SEVERITIES)[number]["value"];

export const NOTE_SEVERITY_STYLES: Record<
  string,
  { badge: "muted" | "warning" | "destructive"; label: string; bar: string }
> = {
  info: { badge: "muted", label: "Hinweis", bar: "bg-[var(--color-border-strong)]" },
  warning: { badge: "warning", label: "Warnung", bar: "bg-[var(--color-warning)]" },
  critical: { badge: "destructive", label: "Kritisch", bar: "bg-[var(--color-destructive)]" },
};

export function noteSeverityStyle(severity: string) {
  return NOTE_SEVERITY_STYLES[severity] ?? NOTE_SEVERITY_STYLES.info;
}

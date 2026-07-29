import "server-only";

/**
 * Gemeinsame CSV-Erzeugung für alle Exporte.
 *
 * Wichtig ist der Schutz vor Formel-Injektion: ein Feld, das mit =, +, -
 * oder @ beginnt, würde von Excel als Formel ausgeführt. Ein
 * vorangestelltes Apostroph verhindert das.
 */

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '""';

  let text: string;

  if (value instanceof Date) {
    text = value.toISOString();
  } else if (typeof value === "boolean") {
    text = value ? "ja" : "nein";
  } else {
    text = String(value);
  }

  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  return `"${text.replace(/"/g, '""')}"`;
}

/** Baut eine vollständige CSV-Datei inklusive BOM für Excel. */
export function buildCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))];

  // Das BOM sorgt dafür, dass Excel UTF-8 erkennt.
  return `﻿${lines.join("\r\n")}`;
}

/**
 * Obergrenze für alle CSV-Exporte.
 *
 * Liegt hier und nicht in den einzelnen Routen, damit die Seiten dieselbe Zahl
 * anzeigen können, die die Route tatsächlich anwendet.
 */
export const EXPORT_LIMIT = 10_000;

/**
 * Antwort-Header für einen CSV-Download.
 *
 * Bei einer gekappten Datei wandert der Hinweis in den Dateinamen. Die CSV
 * selbst bleibt unangetastet – eine Kommentarzeile wäre kein gültiges CSV und
 * würde Tabellenprogramme durcheinanderbringen. So sieht man auch Wochen später
 * noch, dass die Datei unvollständig ist.
 */
export function csvHeaders(filenamePrefix: string, truncated = false): HeadersInit {
  const date = new Date().toISOString().slice(0, 10);
  const suffix = truncated ? `-gekappt-bei-${EXPORT_LIMIT}` : "";

  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filenamePrefix}-${date}${suffix}.csv"`,
    "Cache-Control": "no-store",
  };
}

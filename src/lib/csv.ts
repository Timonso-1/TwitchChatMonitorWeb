import "server-only";

/**
 * Gemeinsame CSV-Erzeugung fuer alle Exporte.
 *
 * Wichtig ist der Schutz vor Formel-Injektion: ein Feld, das mit =, +, -
 * oder @ beginnt, wuerde von Excel als Formel ausgefuehrt. Ein
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

/** Baut eine vollstaendige CSV-Datei inklusive BOM fuer Excel. */
export function buildCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))];

  // Das BOM sorgt dafuer, dass Excel UTF-8 erkennt.
  return `﻿${lines.join("\r\n")}`;
}

/** Antwort-Header fuer einen CSV-Download. */
export function csvHeaders(filenamePrefix: string): HeadersInit {
  const date = new Date().toISOString().slice(0, 10);

  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filenamePrefix}-${date}.csv"`,
    "Cache-Control": "no-store",
  };
}

/**
 * Normalisiert die `metadata`-Spalte des Audit-Logs in eine darstellbare Form.
 *
 * Die Funktion wirft nie: unerwartete Strukturen fallen auf eine
 * Eigenschaftsliste zurück, unbrauchbare auf `none`. Ein einzelner defekter
 * Eintrag darf die Audit-Seite nicht zerlegen.
 *
 * Bewusst frei von Darstellungslogik — das Übersetzen von Permission-Keys in
 * lesbare Namen passiert in der Anzeige über `permissionLabel()`.
 */

export type DiffField =
  | {
      type: "list";
      key: string;
      label: string;
      added: string[];
      removed: string[];
      unchanged: string[];
    }
  | {
      type: "scalar";
      key: string;
      label: string;
      before: string | null;
      after: string | null;
    };

export interface PropertyEntry {
  key: string;
  label: string;
  value: string;
}

export type AuditDetail =
  | { kind: "diff"; fields: DiffField[] }
  | { kind: "properties"; entries: PropertyEntry[] }
  | { kind: "none" };

const FIELD_LABELS: Record<string, string> = {
  permissions: "Berechtigungen",
  roles: "Rollen",
  priority: "Priorität",
  isActive: "Aktiv",
  email: "E-Mail",
  displayName: "Anzeigename",
  username: "Benutzername",
  name: "Name",
  key: "Schlüssel",
  description: "Beschreibung",
  color: "Farbe",
  rows: "Zeilen",
  filters: "Filter",
  truncated: "Gekürzt",
};

/** Schlüssel, deren Werte als Mengen verglichen werden. */
const LIST_KEYS = new Set(["permissions", "roles"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function formatScalar(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Ja" : "Nein";

  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function buildDiffFields(before: Record<string, unknown>, after: Record<string, unknown>): DiffField[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const fields: DiffField[] = [];

  for (const key of keys) {
    if (LIST_KEYS.has(key)) {
      const beforeList = toStringList(before[key]);
      const afterList = toStringList(after[key]);
      const beforeSet = new Set(beforeList);
      const afterSet = new Set(afterList);

      const added = afterList.filter((entry) => !beforeSet.has(entry));
      const removed = beforeList.filter((entry) => !afterSet.has(entry));
      const unchanged = afterList.filter((entry) => beforeSet.has(entry));

      // Unveränderte Listen tragen nichts zum Diff bei.
      if (added.length === 0 && removed.length === 0) continue;

      fields.push({ type: "list", key, label: fieldLabel(key), added, removed, unchanged });
      continue;
    }

    const beforeValue = formatScalar(before[key]);
    const afterValue = formatScalar(after[key]);
    if (beforeValue === afterValue) continue;

    fields.push({ type: "scalar", key, label: fieldLabel(key), before: beforeValue, after: afterValue });
  }

  return fields;
}

function toProperties(metadata: Record<string, unknown>): AuditDetail {
  const entries: PropertyEntry[] = Object.entries(metadata).map(([key, value]) => ({
    key,
    label: fieldLabel(key),
    value: formatScalar(value) ?? "—",
  }));

  return entries.length > 0 ? { kind: "properties", entries } : { kind: "none" };
}

export function normalizeAuditDetail(metadata: unknown): AuditDetail {
  if (!isRecord(metadata)) return { kind: "none" };
  if (Object.keys(metadata).length === 0) return { kind: "none" };

  const hasBefore = "before" in metadata;
  const hasAfter = "after" in metadata;

  if (hasBefore || hasAfter) {
    const beforeIsRecord = isRecord(metadata.before);
    const afterIsRecord = isRecord(metadata.after);

    // before/after vorhanden, aber unbrauchbar: roh darstellen statt verwerfen.
    if (!beforeIsRecord && !afterIsRecord) return toProperties(metadata);

    const fields = buildDiffFields(
      beforeIsRecord ? (metadata.before as Record<string, unknown>) : {},
      afterIsRecord ? (metadata.after as Record<string, unknown>) : {},
    );

    return fields.length > 0 ? { kind: "diff", fields } : { kind: "none" };
  }

  // Altes flaches Format (z. B. role.created vor der Vereinheitlichung):
  // als reines "after" lesen, damit historische Einträge lesbar bleiben.
  if (Object.keys(metadata).some((key) => LIST_KEYS.has(key))) {
    const fields = buildDiffFields({}, metadata);
    return fields.length > 0 ? { kind: "diff", fields } : { kind: "none" };
  }

  return toProperties(metadata);
}

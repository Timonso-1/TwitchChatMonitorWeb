# Audit-Diff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Klick auf eine Zeile im Audit-Log öffnet einen Dialog, der bei Rollen- und Account-Änderungen einen strukturierten Diff der Berechtigungen zeigt.

**Architecture:** `audit/page.tsx` bleibt Server-Komponente und normalisiert die vorhandene `metadata`-Spalte über eine pure Funktion in eine darstellbare Form. Der Tabellenkörper wandert in eine Client-Komponente, die eine einzige Dialog-Instanz für die gesamte Seite hält.

**Tech Stack:** Next.js 15 (App Router, RSC), React 19, TypeScript strict, Radix Dialog, Tailwind v4, Drizzle ORM, Vitest (neu)

## Global Constraints

- Sprache aller Bezeichner im UI und aller Kommentare: **Deutsch** (bestehende Konvention im Projekt).
- Der Normalizer wirft **nie** — ein defekter `metadata`-Eintrag darf die Audit-Seite nicht zerlegen.
- Bestehende Audit-Daten werden **nicht** migriert. Der Normalizer muss das alte flache Format weiterhin lesen.
- Keine neue Berechtigung, kein neuer Endpunkt. `/audit` ist bereits über `requirePermission(PERMISSIONS.AUDIT_VIEW)` abgesichert.
- `src/lib/audit.ts` beginnt mit `import "server-only"` und darf **nicht** aus Client-Komponenten importiert werden. Aktions-Labels werden auf dem Server berechnet und als Props übergeben.
- Nach jeder Task muss `npm run typecheck` fehlerfrei durchlaufen.

## Korrektur gegenüber der Spec

Die Spec behauptet, es sei keine Query-Änderung nötig. Das stimmt für alle Felder **außer `userAgent`**: `AuditListItem` (`src/lib/queries/accounts.ts:342`) und der Select in `listAuditEntries` führen `userAgent` nicht. Task 3 ergänzt beides um je eine Zeile.

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/lib/audit-diff.ts` (neu) | Pure Normalisierung von `metadata` → `AuditDetail`. Keine Darstellung, kein DB-/React-Bezug. |
| `src/lib/audit-diff.test.ts` (neu) | Randfälle des Normalizers. |
| `vitest.config.ts` (neu) | Minimale Vitest-Konfiguration mit `@/`-Alias. |
| `src/components/audit/audit-detail-dialog.tsx` (neu, client) | Rendert einen Audit-Eintrag als Dialog. Reine Darstellung. |
| `src/app/(panel)/audit/audit-table-body.tsx` (neu, client) | Zeilen + `selectedId`-State + eine Dialog-Instanz. |
| `src/app/(panel)/audit/page.tsx` (ändern) | Baut die Zeilen-Objekte, normalisiert server-seitig. |
| `src/lib/queries/accounts.ts` (ändern) | `userAgent` in Interface und Select. |
| `src/lib/actions/roles.ts` (ändern) | Permission-Snapshot bei `role.deleted`, einheitliches Format bei `role.created`. |

---

### Task 1: Vitest-Setup und Normalizer

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/audit-diff.ts`
- Create: `src/lib/audit-diff.test.ts`
- Modify: `package.json:6-16` (Skripte), `package.json:42-53` (devDependencies)

**Interfaces:**
- Consumes: nichts.
- Produces: `normalizeAuditDetail(metadata: unknown): AuditDetail` sowie die Typen `AuditDetail`, `DiffField`, `PropertyEntry` aus `@/lib/audit-diff`.

> **Hinweis zur Signatur:** Die Spec skizzierte `normalizeAuditDetail(action, metadata)`. Der `action`-Parameter wird nirgends gebraucht — die Struktur der Metadaten allein bestimmt die Darstellung. Er entfällt (YAGNI).

- [ ] **Step 1: Vitest installieren**

```bash
npm install --save-dev vitest@^3.0.0
```

- [ ] **Step 2: Vitest konfigurieren**

Erstelle `vitest.config.ts`. Der `@/`-Alias muss zur `tsconfig.json:17-19` passen, sonst schlagen die Imports in den Tests fehl.

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Test-Skript ergänzen**

In `package.json` unter `"scripts"` nach der Zeile `"typecheck": "tsc --noEmit",` einfügen:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 4: Die fehlschlagenden Tests schreiben**

Erstelle `src/lib/audit-diff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeAuditDetail } from "@/lib/audit-diff";

describe("normalizeAuditDetail", () => {
  it("erkennt hinzugefügte und entfernte Berechtigungen", () => {
    const result = normalizeAuditDetail({
      before: { permissions: ["audit.view", "roles.view"], priority: 40 },
      after: { permissions: ["roles.view", "messages.view"], priority: 40 },
    });

    expect(result.kind).toBe("diff");
    if (result.kind !== "diff") return;

    const field = result.fields.find((entry) => entry.key === "permissions");
    expect(field).toBeDefined();
    if (field?.type !== "list") throw new Error("Liste erwartet");

    expect(field.added).toEqual(["messages.view"]);
    expect(field.removed).toEqual(["audit.view"]);
    expect(field.unchanged).toEqual(["roles.view"]);
  });

  it("lässt unveränderte Skalare weg", () => {
    const result = normalizeAuditDetail({
      before: { permissions: ["audit.view"], priority: 40 },
      after: { permissions: [], priority: 40 },
    });

    expect(result.kind).toBe("diff");
    if (result.kind !== "diff") return;
    expect(result.fields.some((entry) => entry.key === "priority")).toBe(false);
  });

  it("zeigt geänderte Skalare als vorher/nachher", () => {
    const result = normalizeAuditDetail({
      before: { permissions: [], priority: 40 },
      after: { permissions: [], priority: 55 },
    });

    if (result.kind !== "diff") throw new Error("Diff erwartet");
    const field = result.fields.find((entry) => entry.key === "priority");
    if (field?.type !== "scalar") throw new Error("Skalar erwartet");

    expect(field.before).toBe("40");
    expect(field.after).toBe("55");
    expect(field.label).toBe("Priorität");
  });

  it("stellt Boolean-Werte lesbar dar", () => {
    const result = normalizeAuditDetail({
      before: { isActive: true },
      after: { isActive: false },
    });

    if (result.kind !== "diff") throw new Error("Diff erwartet");
    const field = result.fields[0];
    if (field?.type !== "scalar") throw new Error("Skalar erwartet");

    expect(field.before).toBe("Ja");
    expect(field.after).toBe("Nein");
  });

  it("liest das alte flache Format als reines after", () => {
    const result = normalizeAuditDetail({
      permissions: ["roles.view", "audit.view"],
      priority: 30,
    });

    expect(result.kind).toBe("diff");
    if (result.kind !== "diff") return;

    const field = result.fields.find((entry) => entry.key === "permissions");
    if (field?.type !== "list") throw new Error("Liste erwartet");

    expect(field.added).toEqual(["roles.view", "audit.view"]);
    expect(field.removed).toEqual([]);
  });

  it("stellt flache Export-Metadaten als Eigenschaftsliste dar", () => {
    const result = normalizeAuditDetail({ rows: 1200, truncated: false });

    expect(result.kind).toBe("properties");
    if (result.kind !== "properties") return;

    expect(result.entries).toEqual([
      { key: "rows", label: "Zeilen", value: "1200" },
      { key: "truncated", label: "Gekürzt", value: "Nein" },
    ]);
  });

  it("liefert none für unbrauchbare Eingaben", () => {
    expect(normalizeAuditDetail(null).kind).toBe("none");
    expect(normalizeAuditDetail(undefined).kind).toBe("none");
    expect(normalizeAuditDetail("kaputt").kind).toBe("none");
    expect(normalizeAuditDetail(42).kind).toBe("none");
    expect(normalizeAuditDetail([]).kind).toBe("none");
    expect(normalizeAuditDetail({}).kind).toBe("none");
  });

  it("wirft nicht, wenn before und after keine Objekte sind", () => {
    const result = normalizeAuditDetail({ before: "alt", after: "neu" });

    expect(result.kind).toBe("properties");
    if (result.kind !== "properties") return;
    expect(result.entries).toHaveLength(2);
  });

  it("ignoriert Nicht-String-Einträge in Listen", () => {
    const result = normalizeAuditDetail({
      before: { permissions: [] },
      after: { permissions: ["roles.view", 42, null] },
    });

    if (result.kind !== "diff") throw new Error("Diff erwartet");
    const field = result.fields[0];
    if (field?.type !== "list") throw new Error("Liste erwartet");

    expect(field.added).toEqual(["roles.view"]);
  });
});
```

- [ ] **Step 5: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/lib/audit-diff"`

- [ ] **Step 6: Normalizer implementieren**

Erstelle `src/lib/audit-diff.ts`:

```ts
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
```

- [ ] **Step 7: Tests laufen lassen, Erfolg bestätigen**

Run: `npm test`
Expected: PASS — 9 Tests in `src/lib/audit-diff.test.ts`

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: keine Ausgabe, Exit-Code 0

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts package.json package-lock.json src/lib/audit-diff.ts src/lib/audit-diff.test.ts
git commit -m "Add audit metadata normalizer with vitest setup"
```

---

### Task 2: Permission-Snapshot beim Löschen und Anlegen von Rollen

**Files:**
- Modify: `src/lib/actions/roles.ts:128-136` (`createRoleAction`), `src/lib/actions/roles.ts:257-277` (`deleteRoleAction`)

**Interfaces:**
- Consumes: nichts aus Task 1.
- Produces: `role.deleted`-Einträge mit `metadata.before.permissions`, `role.created`-Einträge mit `metadata.after.permissions`. Task 1s Normalizer liest beide Formen bereits.

**Hintergrund:** `admin_role_permissions` hat `ON DELETE CASCADE` auf `admin_roles` (`sql/001_admin_schema.sql:63-64`). Die Rechte müssen deshalb **vor** dem `db.delete` gelesen werden, sonst sind sie weg.

- [ ] **Step 1: `createRoleAction` auf einheitliches Format umstellen**

In `src/lib/actions/roles.ts` in `createRoleAction` die `metadata`-Zeile ersetzen.

Vorher:
```ts
    metadata: { permissions: permissionResult.permissions, priority: parsed.data.priority },
```

Nachher:
```ts
    metadata: { after: { permissions: permissionResult.permissions, priority: parsed.data.priority } },
```

- [ ] **Step 2: `deleteRoleAction` um den Snapshot ergänzen**

In `deleteRoleAction` die Rechte vor dem Löschen lesen. Ersetze den Block von `await db.delete(adminRoles)...` bis zum Ende des `writeAudit`-Aufrufs:

```ts
  // Muss vor dem Löschen geschehen: admin_role_permissions hängt per
  // ON DELETE CASCADE an admin_roles.
  const removedPermissions = await db
    .select({ permission: adminRolePermissions.permission })
    .from(adminRolePermissions)
    .where(eq(adminRolePermissions.roleUuid, uuid));

  await db.delete(adminRoles).where(eq(adminRoles.uuid, uuid));

  await writeAudit({
    action: AUDIT_ACTIONS.ROLE_DELETED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "role",
    targetId: uuid,
    targetLabel: role.name,
    metadata: {
      before: {
        permissions: removedPermissions.map((row) => row.permission),
        priority: role.priority,
      },
    },
  });
```

`adminRolePermissions` ist in `src/lib/actions/roles.ts:16` bereits importiert — kein neuer Import nötig.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: keine Ausgabe, Exit-Code 0

- [ ] **Step 4: Commit**

```bash
git add src/lib/actions/roles.ts
git commit -m "Log role permissions on create and delete for audit diff"
```

---

### Task 3: User-Agent laden und Dialog-Komponente

**Files:**
- Modify: `src/lib/queries/accounts.ts:342-355` (Interface), `src/lib/queries/accounts.ts:398-412` (Select)
- Create: `src/components/audit/audit-detail-dialog.tsx`

**Interfaces:**
- Consumes: `AuditDetail`, `DiffField` aus `@/lib/audit-diff` (Task 1).
- Produces: `AuditDetailDialog` und den Typ `AuditRowEntry` aus `@/components/audit/audit-detail-dialog`. Task 4 baut Objekte dieses Typs und rendert damit sowohl die Zeilen als auch den Dialog.

- [ ] **Step 1: `userAgent` in `AuditListItem` ergänzen**

In `src/lib/queries/accounts.ts` im Interface `AuditListItem` nach `ipAddress: string | null;` einfügen:

```ts
  userAgent: string | null;
```

- [ ] **Step 2: `userAgent` in den Select aufnehmen**

In `listAuditEntries` im `.select({ ... })` nach `ipAddress: adminAuditLog.ipAddress,` einfügen:

```ts
      userAgent: adminAuditLog.userAgent,
```

- [ ] **Step 3: Dialog-Komponente erstellen**

Erstelle `src/components/audit/audit-detail-dialog.tsx`.

Beachte: `auditActionLabel` stammt aus `src/lib/audit.ts`, das mit `import "server-only"` beginnt — deshalb kommt `actionLabel` als bereits berechneter Prop herein und wird hier **nicht** importiert. `permissionLabel` aus `@/lib/auth/permissions` ist client-sicher.

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AuditDetail, DiffField } from "@/lib/audit-diff";
import { permissionLabel } from "@/lib/auth/permissions";

/** Ein Audit-Eintrag, aufbereitet für Tabellenzeile und Dialog. */
export interface AuditRowEntry {
  id: number;
  action: string;
  actionLabel: string;
  createdAt: string;
  actorName: string | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  note: string | null;
  outcome: string;
  detail: AuditDetail;
}

export function AuditDetailDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: AuditRowEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {entry.actionLabel}
            <Badge variant={entry.outcome === "failure" ? "destructive" : "success"}>
              {entry.outcome === "failure" ? "Fehler" : "OK"}
            </Badge>
          </DialogTitle>
          <span className="font-mono text-[0.65rem] text-[var(--color-muted-foreground)]">{entry.action}</span>
        </DialogHeader>

        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
          <MetaRow label="Zeitpunkt" value={entry.createdAt} />
          <MetaRow label="Akteur" value={entry.actorName ?? "System"} />
          <MetaRow
            label="Ziel"
            value={
              entry.targetLabel || entry.targetId
                ? `${entry.targetLabel ?? entry.targetId}${entry.targetType ? ` (${entry.targetType})` : ""}`
                : null
            }
          />
          <MetaRow label="IP-Adresse" value={entry.ipAddress} mono />
          <MetaRow label="User-Agent" value={entry.userAgent} mono />
          <MetaRow label="Notiz" value={entry.note} />
        </dl>

        <AuditDetailBody detail={entry.detail} />
      </DialogContent>
    </Dialog>
  );
}

function MetaRow({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;

  return (
    <>
      <dt className="text-xs text-[var(--color-muted-foreground)] sm:pt-0.5">{label}</dt>
      <dd className={mono ? "break-all font-mono text-xs" : "break-words"}>{value}</dd>
    </>
  );
}

function AuditDetailBody({ detail }: { detail: AuditDetail }) {
  if (detail.kind === "none") {
    return (
      <p className="border-t border-[var(--color-border)] pt-4 text-sm text-[var(--color-muted-foreground)]">
        Keine weiteren Details protokolliert.
      </p>
    );
  }

  if (detail.kind === "properties") {
    return (
      <dl className="grid gap-x-4 gap-y-2 border-t border-[var(--color-border)] pt-4 text-sm sm:grid-cols-[8rem_1fr]">
        {detail.entries.map((entry) => (
          <MetaRow key={entry.key} label={entry.label} value={entry.value} />
        ))}
      </dl>
    );
  }

  return (
    <div className="space-y-4 border-t border-[var(--color-border)] pt-4">
      {detail.fields.map((field) => (
        <DiffFieldView key={field.key} field={field} />
      ))}
    </div>
  );
}

function DiffFieldView({ field }: { field: DiffField }) {
  if (field.type === "scalar") {
    return (
      <div className="space-y-1">
        <p className="text-xs text-[var(--color-muted-foreground)]">{field.label}</p>
        <p className="text-sm">
          <span className="text-[var(--color-muted-foreground)] line-through">{field.before ?? "—"}</span>
          <span className="mx-2 text-[var(--color-muted-foreground)]">→</span>
          <span>{field.after ?? "—"}</span>
        </p>
      </div>
    );
  }

  const isPermissionList = field.key === "permissions";
  const label = (value: string) => (isPermissionList ? permissionLabel(value) : value);

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-[var(--color-muted-foreground)]">
        {field.label}
        {field.unchanged.length > 0 && (
          <span className="ml-2">({field.unchanged.length} unverändert)</span>
        )}
      </p>

      <ul className="space-y-1">
        {field.added.map((value) => (
          <li key={`add-${value}`} className="flex gap-2 text-sm">
            <span className="select-none font-mono text-[var(--color-success)]">+</span>
            <span>
              {label(value)}
              {isPermissionList && (
                <span className="block font-mono text-[0.65rem] text-[var(--color-muted-foreground)]">{value}</span>
              )}
            </span>
          </li>
        ))}
        {field.removed.map((value) => (
          <li key={`remove-${value}`} className="flex gap-2 text-sm">
            <span className="select-none font-mono text-[var(--color-destructive)]">−</span>
            <span className="text-[var(--color-muted-foreground)]">
              {label(value)}
              {isPermissionList && <span className="block font-mono text-[0.65rem]">{value}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: keine Ausgabe, Exit-Code 0

Die Komponente ist an dieser Stelle noch ungenutzt — das ist erwartet und kein Fehler. `noUnusedLocals` ist in `tsconfig.json` nicht gesetzt.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/accounts.ts src/components/audit/audit-detail-dialog.tsx
git commit -m "Add audit detail dialog component and load user agent"
```

---

### Task 4: Tabellenkörper verdrahten

**Files:**
- Create: `src/app/(panel)/audit/audit-table-body.tsx`
- Modify: `src/app/(panel)/audit/page.tsx:96-149` (Tabelle), Importe in `page.tsx:1-17`

**Interfaces:**
- Consumes: `AuditDetailDialog`, `AuditRowEntry` (Task 3); `normalizeAuditDetail` (Task 1).
- Produces: nichts für spätere Tasks — das ist die letzte.

- [ ] **Step 1: Client-Komponente für den Tabellenkörper erstellen**

Erstelle `src/app/(panel)/audit/audit-table-body.tsx`:

```tsx
"use client";

import { useState } from "react";
import { AuditDetailDialog, type AuditRowEntry } from "@/components/audit/audit-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { TableBody, TableCell, TableEmpty, TableRow } from "@/components/ui/table";
import { truncate } from "@/lib/utils";

export function AuditTableBody({ entries }: { entries: AuditRowEntry[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = entries.find((entry) => entry.id === selectedId) ?? null;

  return (
    <>
      <TableBody>
        {entries.length === 0 ? (
          <TableEmpty colSpan={6} title="Keine Einträge gefunden" />
        ) : (
          entries.map((entry) => (
            <TableRow
              key={entry.id}
              role="button"
              tabIndex={0}
              aria-label={`Details zu ${entry.actionLabel}`}
              onClick={() => setSelectedId(entry.id)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                setSelectedId(entry.id);
              }}
              className="cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ring)]"
            >
              <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                {entry.createdAt}
              </TableCell>
              <TableCell className="text-sm">
                {entry.actionLabel}
                <span className="block font-mono text-[0.65rem] text-[var(--color-muted-foreground)]">
                  {entry.action}
                </span>
              </TableCell>
              <TableCell className="max-w-36 truncate text-sm">{entry.actorName ?? "System"}</TableCell>
              <TableCell className="text-sm">
                {entry.targetLabel ?? entry.targetId ?? "—"}
                {entry.targetType && (
                  <span className="ml-1.5 text-xs text-[var(--color-muted-foreground)]">({entry.targetType})</span>
                )}
                {entry.note && (
                  <span className="block text-xs text-[var(--color-muted-foreground)]">
                    {truncate(entry.note, 90)}
                  </span>
                )}
              </TableCell>
              <TableCell className="font-mono text-xs text-[var(--color-muted-foreground)]">
                {entry.ipAddress ?? "—"}
              </TableCell>
              <TableCell>
                <Badge variant={entry.outcome === "failure" ? "destructive" : "success"}>
                  {entry.outcome === "failure" ? "Fehler" : "OK"}
                </Badge>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>

      <AuditDetailDialog
        entry={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </>
  );
}
```

- [ ] **Step 2: Importe in `page.tsx` anpassen**

In `src/app/(panel)/audit/page.tsx` die Import-Zeile für die Tabelle ersetzen.

Vorher:
```tsx
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
```

Nachher:
```tsx
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
```

Und diese Importe ergänzen:
```tsx
import { AuditTableBody } from "./audit-table-body";
import type { AuditRowEntry } from "@/components/audit/audit-detail-dialog";
import { normalizeAuditDetail } from "@/lib/audit-diff";
```

`Badge` und `truncate` werden in `page.tsx` danach nicht mehr gebraucht — entferne `Badge` aus den Importen und `truncate` aus dem `@/lib/utils`-Import. `formatDateTime` und `formatRelative` bleiben (`formatRelative` wird in der Statistik-Karte verwendet).

- [ ] **Step 3: Zeilen-Objekte auf dem Server bauen**

In `page.tsx` nach der `activeFilters`-Zeile einfügen:

```tsx
  const entries: AuditRowEntry[] = items.map((entry) => ({
    id: entry.id,
    action: entry.action,
    actionLabel: auditActionLabel(entry.action),
    createdAt: formatDateTime(entry.createdAt),
    actorName: entry.actorName,
    targetType: entry.targetType,
    targetId: entry.targetId,
    targetLabel: entry.targetLabel,
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    note: entry.note,
    outcome: entry.outcome,
    detail: normalizeAuditDetail(entry.metadata),
  }));
```

- [ ] **Step 4: Tabellenkörper ersetzen**

Ersetze in `page.tsx` den gesamten `<TableBody>…</TableBody>`-Block (von `<TableBody>` bis `</TableBody>` einschließlich) durch:

```tsx
            <AuditTableBody entries={entries} />
```

Der `<TableHeader>`-Block mit den sechs `<TableHead>`-Spalten bleibt unverändert, ebenso `<Pagination>`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: keine Ausgabe, Exit-Code 0

- [ ] **Step 6: Tests laufen lassen**

Run: `npm test`
Expected: PASS — 9 Tests

- [ ] **Step 7: Build prüfen**

Run: `npm run build`
Expected: erfolgreicher Build, keine Fehler zur Server/Client-Grenze

Schlägt der Build mit einer Meldung zu `server-only` fehl, wurde irgendwo `@/lib/audit` in eine Client-Komponente importiert — Aktions-Labels gehören als Prop übergeben.

- [ ] **Step 8: Manuell prüfen**

Starte `npm run dev` und öffne `/audit`. Prüfe:

1. Klick auf eine beliebige Zeile öffnet den Dialog.
2. Tab-Navigation erreicht die Zeilen, Enter öffnet den Dialog.
3. Ein `role.updated`-Eintrag zeigt Berechtigungen mit `+`/`−` und lesbaren Namen.
4. Ein `messages.exported`-Eintrag zeigt die Eigenschaftsliste (Zeilen, Filter, Gekürzt).
5. Ein `auth.login.success`-Eintrag zeigt „Keine weiteren Details protokolliert."
6. Filter und Paginierung funktionieren unverändert.

Für Punkt 3 gegebenenfalls unter `/roles` eine Testrolle anlegen, ihre Rechte ändern und wieder löschen — das erzeugt alle drei neuen Metadaten-Formen.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(panel)/audit/audit-table-body.tsx" "src/app/(panel)/audit/page.tsx"
git commit -m "Open audit detail dialog from log rows"
```

---

## Verifikation zum Abschluss

```bash
npm run typecheck && npm test && npm run build
```

Alle drei müssen fehlerfrei durchlaufen, bevor die Arbeit als fertig gilt.

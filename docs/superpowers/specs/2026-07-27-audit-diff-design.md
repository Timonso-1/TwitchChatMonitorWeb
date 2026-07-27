# Audit-Log: Detail-Dialog mit Diff-Ansicht

**Datum:** 2026-07-27
**Status:** Entwurf zur Umsetzung

## Problem

Das Audit-Log unter `/audit` zeigt sechs Spalten pro Eintrag: Zeit, Aktion, Akteur, Ziel, IP, Ergebnis. Die Spalte `metadata` der Tabelle `admin_audit_log` wird in `listAuditEntries` bereits mitselektiert (`src/lib/queries/accounts.ts:410`), in `src/app/(panel)/audit/page.tsx` aber nirgends gerendert.

Dadurch ist nicht nachvollziehbar, *was* sich bei einer Änderung geändert hat. `updateRoleAction` schreibt bereits `before`/`after` mit Permissions und Priorität (`src/lib/actions/roles.ts:229`), `updateAccountAction` ebenso für Email, Anzeigename, Aktivstatus und Rollen (`src/lib/actions/accounts.ts:275`) — sichtbar ist davon nichts.

Zusätzlich besteht eine Lücke auf der Schreibseite: `deleteRoleAction` protokolliert beim Löschen einer Rolle **keine** Permissions (`src/lib/actions/roles.ts:270`). Nach dem Löschen lässt sich nicht mehr feststellen, welche Rechte die Rolle vergeben hat — genau der Fall, für den ein Audit-Log existiert.

## Ziel

Ein Klick auf eine Audit-Zeile öffnet einen Dialog mit allen Details des Eintrags. Liegen `before`/`after` vor, wird ein strukturierter Diff gerendert; bei flachen Metadaten eine Eigenschaftsliste; sonst nur die Kopfdaten.

Nicht Teil dieser Spec: Reporting/Wochenbericht (eigenes Vorhaben), Migration bestehender Audit-Daten, Änderungen an Filtern oder Paginierung.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Darstellung | Dialog/Modal (nutzt vorhandene Radix-Komponenten) |
| Umfang | Alle Einträge klickbar, Dialog-Inhalt passt sich der Datenlage an |
| Schreibseite | `role.deleted` und `role.created` werden ergänzt |
| Tests | Vitest-Setup, Tests für den Normalizer |

## Architektur

`audit/page.tsx` bleibt Server-Komponente. Query, Filter, Statistik-Karten und Paginierung bleiben unverändert.

Der Tabellenkörper wandert in eine Client-Komponente, die den ausgewählten Eintrag als State hält. **Eine** Dialog-Instanz für die gesamte Tabelle, nicht eine pro Zeile — bei 50 Zeilen pro Seite hingen sonst 50 Radix-Dialoge im Baum.

Normalisiert wird server-seitig in `page.tsx`. Das hält den Client-Bundle klein, macht den Normalizer ohne Browser testbar, und das Ergebnis ist reines JSON und damit über die Server/Client-Grenze serialisierbar.

```
page.tsx (server)
  └─ listAuditEntries()          unverändert
  └─ normalizeAuditDetail()      neu, pro Eintrag
       └─ <AuditTableBody>       neu, client
            ├─ <TableRow> …      onClick → setSelectedId
            └─ <AuditDetailDialog>   eine Instanz
```

## Bausteine

### 1. `src/lib/audit-diff.ts`

Pure Funktion ohne DB- oder React-Bezug. Kein `server-only`, damit sie aus Tests und notfalls aus Client-Code importierbar bleibt.

```ts
export type AuditDetail =
  | { kind: "diff"; fields: DiffField[] }
  | { kind: "properties"; entries: PropertyEntry[] }
  | { kind: "none" };

export type DiffField =
  | { type: "list"; label: string; added: string[]; removed: string[]; unchanged: string[] }
  | { type: "scalar"; label: string; before: string | null; after: string | null };

export interface PropertyEntry {
  label: string;
  value: string;
}

export function normalizeAuditDetail(action: string, metadata: unknown): AuditDetail;
```

**Feldzuordnung.** `permissions` und `roles` werden als Liste behandelt (Mengenvergleich zwischen `before` und `after`), alle übrigen Schlüssel als Skalar. Labels kommen aus einer Zuordnungstabelle im Modul (`permissions` → „Berechtigungen", `priority` → „Priorität", `isActive` → „Aktiv", `email` → „E-Mail", `displayName` → „Anzeigename", `roles` → „Rollen"); unbekannte Schlüssel werden unverändert als Label verwendet.

Unveränderte Skalare erscheinen nicht im Ergebnis — der Diff zeigt nur, was sich geändert hat. Bei Listen wird `unchanged` mitgeliefert, damit die Anzeige den vollen Kontext optional darstellen kann.

Das Übersetzen von Permission-Keys in lesbare Namen passiert **nicht** hier, sondern in der Anzeige über `permissionLabel()` (`src/lib/auth/permissions.ts:261`). Der Normalizer bleibt dadurch frei von Darstellungslogik und die Tests vergleichen stabile Keys.

**Legacy-Format.** Vor dieser Änderung geschriebene `role.created`-Einträge haben die flache Form `{ permissions, priority }`. Nach der Umstellung auf `{ after: { … } }` muss der Normalizer beide lesen: liegt weder `before` noch `after` vor, aber ein bekannter Schlüssel wie `permissions`, wird das Objekt als `after`-only interpretiert. Bestehende Audit-Daten werden nicht migriert.

**Fehlertoleranz.** `metadata` ist als `json` typisiert und kommt als `unknown` an. Die Funktion wirft nie:

- `null` / `undefined` / kein Objekt → `{ kind: "none" }`
- `before`/`after` vorhanden, aber kein Objekt → Rückfall auf `properties` mit Roh-Darstellung
- unbekannte flache Struktur → `properties`, Werte über `JSON.stringify` für nicht-primitive Typen
- leeres Objekt → `{ kind: "none" }`

Ein einzelner defekter Eintrag darf die Audit-Seite nicht zum Absturz bringen.

### 2. `src/components/audit/audit-detail-dialog.tsx` (client)

Props: der Eintrag (Aktion, Zeitpunkt, Akteur, Ziel, IP, User-Agent, Notiz, Ergebnis), das normalisierte `AuditDetail`, sowie `open` / `onOpenChange`.

Aufbau:

- **Kopf** — `auditActionLabel(action)`, darunter der rohe Action-Key in Monospace (wie in der Tabelle), Ergebnis als `Badge`, Zeitpunkt über `formatDateTime`
- **Kopfdaten** — Akteur, Ziel (mit `targetType`), IP, User-Agent, Notiz; leere Felder werden ausgelassen statt als „—" gezeigt
- **Inhalt** — je nach `kind`:
  - `diff`: Listen mit `+`/`−` und farblicher Auszeichnung (grün/rot über die vorhandenen CSS-Variablen), Skalare als `vorher → nachher`
  - `properties`: zweispaltige Liste
  - `none`: dezenter Hinweis „Keine weiteren Details protokolliert."

`DialogContent` bekommt `className="max-w-2xl"` — der Default `max-w-lg` (`src/components/ui/dialog.tsx:37`) ist für Diffs zu schmal. Die vorhandene Begrenzung `max-h-[calc(100vh-4rem)] overflow-y-auto` deckt lange Permission-Listen bereits ab.

Permission-Einträge laufen durch `permissionLabel()`; der rohe Key wird zusätzlich klein darunter gezeigt, analog zur Aktionsspalte der Tabelle.

### 3. `src/app/(panel)/audit/audit-table-body.tsx` (client)

Hält `selectedId: number | null`. Rendert die Zeilen (Markup wandert unverändert aus `page.tsx` hierher) und darunter eine `AuditDetailDialog`-Instanz für den ausgewählten Eintrag.

Zugänglichkeit: die Zeile bekommt `role="button"`, `tabIndex={0}`, Enter/Leertaste öffnen den Dialog, `cursor-pointer` und ein Hover-Zustand. Ein reines `onClick` auf `<tr>` ohne Tastaturzugang wäre nicht ausreichend.

Der `TableEmpty`-Fall bleibt erhalten.

### 4. Schreibseite: `src/lib/actions/roles.ts`

**`deleteRoleAction`** — vor dem `db.delete` die Permissions der Rolle lesen und in den Audit-Eintrag aufnehmen:

```ts
metadata: { before: { permissions, priority: role.priority } }
```

Die Abfrage muss vor dem Löschen erfolgen, da `admin_role_permissions` per Fremdschlüssel mitgelöscht wird.

**`createRoleAction`** — `metadata` von `{ permissions, priority }` auf `{ after: { permissions, priority } }` umstellen, damit alle drei Rollen-Aktionen dieselbe Form haben.

Keine Änderung an `updateRoleAction` und den Account-Aktionen — deren Format passt bereits.

### 5. Tests

Vitest als Dev-Abhängigkeit, Konfiguration auf das Nötigste beschränkt (Node-Umgebung, `@/`-Alias passend zur `tsconfig.json`), plus ein `test`-Skript in der `package.json`.

`src/lib/audit-diff.test.ts` deckt ab:

- Permissions hinzugefügt, entfernt, beides gleichzeitig
- unveränderte Skalare erscheinen nicht im Ergebnis
- Legacy-Format ohne `before`/`after` wird als `after`-only gelesen
- `null`, leeres Objekt, primitiver Wert → `kind: "none"`
- `before`/`after` mit unerwarteten Typen → kein Wurf, Rückfall auf `properties`
- flache Export-Metadaten (`{ rows, filters, truncated }`) → `properties`

Keine Komponenten-Tests — der Dialog ist Darstellung ohne eigene Logik.

## Berechtigungen

Unverändert. `/audit` ist bereits über `requirePermission(PERMISSIONS.AUDIT_VIEW)` abgesichert; der Dialog zeigt ausschließlich Daten derselben Anfrage. Kein neuer Endpunkt, keine neue Berechtigung.

## Nachträgliche Korrekturen

Zwei Punkte, die sich erst bei der Planung zeigten:

1. **`userAgent` wird nicht geladen.** Weder `AuditListItem` (`src/lib/queries/accounts.ts:342`) noch der Select in `listAuditEntries` führen die Spalte. Der Dialog braucht dafür je eine zusätzliche Zeile — die Behauptung „keine Query-Änderung nötig" gilt für alle übrigen Felder, nicht für dieses.
2. **`src/lib/audit.ts` beginnt mit `import "server-only"`.** `auditActionLabel()` kann deshalb nicht in der Client-Komponente aufgerufen werden. Das Label wird auf dem Server berechnet und als Prop übergeben; `audit.ts` bleibt unangetastet.

## Bewusst nicht enthalten

- **Verlinkbare URL für den Dialog.** Ein Query-Parameter (`?entry=123`) würde Deep-Links ermöglichen, kostet aber Router-Round-Trips beim Öffnen. Bei Bedarf nachrüstbar, ohne die Struktur zu ändern.
- **Metadaten-Lücken der übrigen Aktionen** (Channels, Watch-Terms, Viewer-Notizen, 2FA). Bewusst ausgeklammert, um den Umfang klein zu halten; der Dialog zeigt dort schlicht die Kopfdaten.
- **Migration alter Audit-Einträge.** Ein Audit-Log nachträglich umzuschreiben widerspricht seinem Zweck.

## Umsetzungsreihenfolge

1. Vitest-Setup, `test`-Skript
2. `audit-diff.ts` mit Tests
3. Schreibseite in `roles.ts` ergänzen
4. `audit-detail-dialog.tsx`
5. `audit-table-body.tsx`, `page.tsx` umbauen
6. `npm run typecheck` und `npm test`

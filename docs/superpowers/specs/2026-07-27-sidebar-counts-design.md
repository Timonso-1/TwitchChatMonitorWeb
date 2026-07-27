# Zähler-Badges in der Sidebar-Navigation

**Datum:** 2026-07-27
**Status:** Design abgenommen

## Ziel

Jeder Navigationseintrag, hinter dem eine zählbare Menge steht, zeigt rechts in
der Zeile die Anzahl seiner Einträge. Der Nutzer sieht damit auf einen Blick, wie
viele Channels, Nachrichten, Events, Zuschauer, Moderationsaktionen, Accounts und
Rollen es gibt, ohne die jeweilige Seite zu öffnen.

## Umfang

### Einträge mit Zahl

| Nav-Eintrag | Pfad | Tabelle | Zählung | Cache |
|---|---|---|---|---|
| Channels | `/channels` | `channels` | `COUNT(*)` | 60 s |
| Nachrichten | `/messages` | `messages` | `COUNT(*)` | 300 s |
| Events | `/events` | `events` | `COUNT(*)` | 300 s |
| Zuschauer | `/viewers` | `users` (Schema: `viewers`) | `COUNT(*)` | 300 s |
| Moderation | `/moderation` | `moderation_actions` | `COUNT(*)` | 300 s |
| Wortfilter | `/watchlist` | `admin_watch_terms` | `COUNT(*)` | 60 s |
| Beobachtungsliste | `/watchboard` | `admin_viewer_notes` | `COUNT(DISTINCT viewer_user_id)` | 60 s |
| Accounts | `/accounts` | `admin_users` | `COUNT(*)` | 60 s |
| Rollen | `/roles` | `admin_roles` | `COUNT(*)` | 60 s |
| Audit-Log | `/audit` | `admin_audit_log` | `COUNT(*)` | 300 s |

Die Cachedauer richtet sich danach, wie schnell eine Änderung sichtbar werden
muss: kurze Zeit für kleine, manuell gepflegte Tabellen (ein neu angelegter
Channel erscheint in höchstens 60 Sekunden), lange Zeit für die Log-Tabellen, bei
denen eine Abweichung von wenigen Minuten bedeutungslos ist.

Bei `/watchboard` wird bewusst nach `viewer_user_id` entdoppelt: Die Seite listet
beobachtete Zuschauer, nicht einzelne Notizen. Ein einfaches `COUNT(*)` würde eine
höhere Zahl anzeigen, als die Liste Zeilen hat.

### Einträge ohne Zahl

- **Dashboard**, **Live-Chat**, **Name-/ID-Konverter** — dahinter steht keine
  zählbare Menge.
- **Emotes** — bewusste Entscheidung. Emote-Verwendungen stecken im `emotes`-Tag
  jeder Nachricht, einem nicht indizierbaren Textfeld. `src/lib/queries/emotes.ts`
  wertet deshalb nur eine Stichprobe von 20.000 Nachrichten in JavaScript aus. Ein
  exakter Gesamtwert wäre ein vollständiger Tabellenscan mit anschließendem
  Parsen; eine Hochrechnung wäre eine Zahl, die nichts Belastbares aussagt.
  Deshalb bleibt der Eintrag ohne Zahl.

## Architektur

### Datenschicht: `src/lib/queries/nav-counts.ts` (neu)

Ein Export:

```ts
export async function getNavCounts(
  permissions: string[],
): Promise<Partial<Record<NavCountKey, number>>>;
```

Die Funktion leitet aus `NAVIGATION` und `hasPermission` ab, welche Zähler der
aufrufende Nutzer sehen darf, und fragt ausschließlich diese ab. Damit bezahlt
niemand für Zahlen, die er nicht sieht, und es gelangen keine Werte an Nutzer ohne
das passende Recht.

Jeder Zähler ist eine eigene, mit `unstable_cache` umhüllte Funktion mit eigenem
Cache-Key — nicht ein gemeinsam gecachtes Bündel. Andernfalls würde der billige
Channel-Zähler beim Ablaufen den teuren Nachrichten-Zähler mit invalidieren.

Die Datei folgt dem bestehenden Muster aus `src/lib/queries/dashboard.ts:33`
(`getMessagesTotalCached`) inklusive `import "server-only"`.

**Fehlerverhalten:** Jeder Zähler ist einzeln abgesichert. Schlägt eine Abfrage
fehl, liefert sie `undefined`, und das betreffende Badge entfällt. `getNavCounts`
wirft nie — ein Datenbankproblem darf nicht die gesamte Sidebar und damit das
Panel unbrauchbar machen.

### Nav-Definition: `src/lib/navigation.ts`

`NavItem` erhält ein optionales Feld `countKey?: NavCountKey`. Die Union
`NavCountKey` wird hier definiert und von `nav-counts.ts` importiert, damit
Navigation und Abfrageschicht nicht auseinanderlaufen können: Ein `countKey` ohne
zugehörige Abfrage ist ein Typfehler.

### Übergabe: `src/app/(panel)/layout.tsx`

Das Layout ruft `getNavCounts(session.user.permissions)` auf und reicht das
**Promise** — nicht dessen aufgelösten Wert — an `AppShell` weiter. Es wird an
dieser Stelle bewusst nicht abgewartet.

### Darstellung: `app-shell.tsx` und `nav-count.tsx` (neu)

Der Nav-Link wird umgebaut zu:

```
<Icon />
<span className="min-w-0 flex-1 truncate">{item.label}</span>
{item.countKey && (
  <Suspense fallback={null}>
    <NavCount promise={countsPromise} countKey={item.countKey} />
  </Suspense>
)}
```

`NavCount` ist eine kleine Client-Komponente, die das Promise per `use()` auflöst.
Dadurch rendert die Navigation sofort, und die Zahlen erscheinen kurz darauf. Kein
Seitenaufruf blockiert je auf dem vollständigen `COUNT(*)` über `messages`. React
19 und Next 15.2 sind im Projekt vorhanden und unterstützen dieses Vorgehen.

Da die Zahlen rechtsbündig stehen, entsteht beim Nachladen kein Layoutsprung: Der
Text links behält seine Position.

**Optik:** rechtsbündige Zahl in `text-xs tabular-nums` in
`var(--color-subtle)`, in der aktiven Zeile etwas kräftiger in
`var(--color-muted-foreground)`. Kein Chip mit eigenem Hintergrund — bei zehn
Einträgen untereinander würde das die ruhige Wirkung der Navigation zerstören, und
in der aktiven Zeile läge ein Chip-Hintergrund auf dem Accent-Hintergrund.

Das `title`-Attribut trägt den vollständigen Wert in deutscher
Tausendertrennung (`1.234.567`), damit die Kurzform nachprüfbar bleibt.

Beide Sidebar-Varianten — Desktop und mobiles Overlay — rendern über
`sidebarInner` dieselbe `navigation`-Konstante und erhalten die Änderung deshalb
automatisch.

### Formatierung: `formatNavCount` in `src/lib/utils.ts`

- unter 1.000: exakt, etwa `847`
- unter 1.000.000: eine Nachkommastelle mit `k`, etwa `12,4k`
- darüber: eine Nachkommastelle mit `M`, etwa `1,2M`

Deutsches Dezimalkomma, passend zum übrigen Panel. Die Kurzform hält die Zahl auch
bei Millionenwerten schmal genug für die 240 Pixel breite Sidebar.

## Auswirkungen auf bestehenden Code

- `src/lib/navigation.ts` — neues optionales Feld, neuer exportierter Typ.
- `src/app/(panel)/layout.tsx` — ein Aufruf, ein zusätzliches Prop.
- `src/components/app-shell.tsx` — Link-Innenleben umgebaut, neues Prop, neuer
  Import.
- `src/lib/utils.ts` — eine neue Funktion.

Kein Datenbankschema wird verändert, keine Abhängigkeit hinzugefügt.

## Test

Auf `main` — der Grundlage dieses Zweigs — gibt es kein Testframework;
`package.json` kennt nur `typecheck` und `build`. Auf dem parallelen Zweig
`feat/audit-diff` wird Vitest gerade eingeführt, das ist hier aber nicht
verfügbar. Bewusste Entscheidung für diese Arbeit: **vorerst ohne Testframework.**
Geprüft wird deshalb so:

- `npm run typecheck` muss fehlerfrei durchlaufen. Die Kopplung zwischen
  `countKey` und den Abfragen ist so gebaut, dass ein Auseinanderlaufen hier
  auffällt.
- `formatNavCount` wird über ein kurzes `tsx`-Skript an den Grenzwerten geprüft:
  0, 999, 1000, 999.999, 1.000.000. Das Skript ist ein Wegwerfartefakt und wird
  nicht eingecheckt.
- Manuelle Prüfung im laufenden Panel: Zahlen erscheinen bei allen zehn
  Einträgen, Emotes bleibt ohne Zahl, die Zahl bei Beobachtungsliste stimmt mit
  der Zeilenzahl der Seite überein, und ein Nutzer mit eingeschränkten Rechten
  sieht nur die Zahlen der für ihn sichtbaren Einträge.

Sobald Vitest über `feat/audit-diff` auf `main` gelandet ist, ist
`formatNavCount` der offensichtliche Kandidat für einen echten Unit-Test — reine
Funktion, klare Grenzwerte. Das ist dann eine eigene, kleine Nacharbeit.

# Live-Chat als Nachrichtentabelle

**Datum:** 2026-07-27
**Status:** Entwurf abgenommen

## Ziel

Der Live-Chat zeigt Nachrichten heute als kompakte Chatzeilen mit deutlich
weniger Information als der Nachrichten-Tab. Er soll dieselbe Tabelle und
dieselbe Nachrichtendarstellung bekommen wie `/messages` – ohne seine
Live-Eigenschaften zu verlieren.

## Ausgangslage

`/messages` (`src/app/(panel)/messages/page.tsx:171-222`) rendert pro Nachricht
Avatar, echte Twitch-Abzeichen, Antwortbezug, Gelöscht-Markierung, Bits, Erste
Nachricht und Abo-Monate. `/live` (`src/app/(panel)/live/live-chat.tsx:239-310`)
zeigt davon nur Bits und Erste Nachricht, dazu generische Rollen-Badges.

| | `/messages` | `/live` heute |
|---|---|---|
| Avatar (`ViewerAvatar`) | ja | nein |
| Echte Abzeichenbilder (`ChatBadges`) | ja | nein, nur `ChatRoleBadges` |
| Abo-Monate aus `badgeInfo` | ja | nein |
| Antwortbezug | ja | nein |
| Gelöscht-Markierung | ja | nein |
| Emote-Bilder | nein (`showEmoteImages` ungesetzt) | nein |
| Wortfilter-Highlighting | nein | ja |

Zwei Randbefunde:

- `showEmoteImages` wird im gesamten Projekt nirgends gesetzt. Die Emote-Bilder
  in `MessageContent` sind toter Code. Da der Live-Chat „alles bekommen soll,
  was der Nachrichten-Tab hat", bleiben sie **aus**.
- `src/lib/twitch-api.ts` beginnt mit `import "server-only"`. `LiveChat` ist eine
  Client-Komponente und kann Avatare und Abzeichensätze deshalb nicht selbst
  laden.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Darstellung | Echte Tabelle mit den vier Spalten aus `/messages` |
| Reihenfolge | Neueste unten, Auto-Scroll bleibt (weicht bewusst von `desc` in `/messages` ab) |
| Umfang | Alles, was `/messages` heute zeigt – also ohne Emote-Bilder |
| Datentransport | Batch-Wörterbücher mit Client-Akkumulation |
| Gelöscht-Markierung | Wird per Cursor nachgetragen, auch für Nachrichten im Puffer |
| Zeitformat | `formatDateTime` wie in `/messages` |

## Architektur

### Datentransport

Der Client akkumuliert die Wörterbücher über Abrufe hinweg. Sie werden dabei
direkt in die verschachtelte `Map`-Form gebracht, die `ChatBadges` über seine
`set`-Prop ohnehin erwartet.

**Folge: keine geteilte Komponente wird geändert.** `ChatBadges`,
`MessageContent`, `ViewerAvatar`, `ChatName` und `HighlightedMessage` werden
unverändert wiederverwendet, `/messages` wird nicht angefasst.

### API-Vertrag

```
GET /api/live-chat?channel=<uuid>&after=<msgId>&modAfter=<modId>&limit=<n>

{
  messages:     LiveMessage[],   // bisherige Felder + badges, badgeInfo,
                                 //   channelId, messageId, replyToMessageId
  latestId:     number,
  modCursor:    number,          // höchste gesehene moderation_actions.id
  deletedIds:   string[],        // message_ids neu gelöschter Nachrichten
  avatars:      Record<string, { profileImageUrl: string | null; displayName: string | null }>,
  badgeImages:  Record<string, Record<string, Record<string, BadgeImage>>>,
                                 // channelId -> name -> version -> Bild
  replyTargets: Record<string, { userName: string; content: string }>,
}
```

Beide Cursor verhalten sich gleich: `0` bedeutet Erstabruf.

- `after=0` lädt den aktuellen Verlauf (Verhalten wie heute).
- `modAfter=0` darf **nicht** alle jemals erfolgten Löschungen liefern. Die
  Route ermittelt in diesem Fall die Löschungen nur für die Nachrichten des
  aktuellen Stapels – dieselbe `IN`-Abfrage wie `getMessageContext`
  (`src/lib/queries/twitch.ts:167-186`) – und gibt den aktuellen Höchststand von
  `moderation_actions.id` als `modCursor` zurück. Erst ab dem zweiten Abruf
  läuft sie inkrementell über `id > modAfter`.

`moderation_actions.id` ist autoincrement (`src/lib/db/schema/twitch.ts:107`),
das Cursor-Muster trägt also.

### Dateistruktur

| Datei | Rolle |
|---|---|
| `src/lib/queries/live-chat.ts` | **neu** – gesamte serverseitige Anreicherung |
| `src/app/api/live-chat/route.ts` | nur noch Auth, Parameter, Aufruf, Fehler |
| `src/lib/live-chat-feed.ts` | **neu** – reine Funktionen für Stapel und Wörterbücher |
| `src/lib/live-chat-feed.test.ts` | **neu** – Vitest gegen diese Funktionen |
| `src/app/(panel)/live/live-chat.tsx` | Container: Zustand, Abrufschleife, Steuerleiste |
| `src/app/(panel)/live/live-chat-table.tsx` | **neu** – rein darstellende Tabelle |

Der Schnitt ist nicht kosmetisch: `live-chat.tsx` hat heute 331 Zeilen und
würde mit Tabelle und vier Wörterbüchern über 500 wachsen. Die reinen
Funktionen in `live-chat-feed.ts` sind der einzige Teil mit echter Logik und
werden dadurch ohne DOM und ohne Datenbank testbar.

### Tabelle

Spalten wie in `/messages`:

| Spalte | Breite | Inhalt |
|---|---|---|
| Zeit | `w-40` | `formatDateTime(receivedAt)` |
| Channel | `w-32` | `channelName`, immer sichtbar |
| Nutzer | `w-48` | `ViewerAvatar` + `ChatBadges` + `ChatName`, verlinkt auf `/viewers/<userId>` |
| Nachricht | – | `MessageContent` |

Der Scroll-Container (`h-[60vh]`, `overflow-y-auto`) liegt **um** `<Table>`, der
`<TableHeader>` wird per `sticky top-0 z-10` festgepinnt. `TableHeader` reicht
`className` durch, `src/components/ui/table.tsx` bleibt unverändert.

Leerer Zustand: `TableEmpty colSpan={4}` mit „Warte auf Nachrichten…" bzw.
„Noch keine Treffer." bei aktivem Trefferfilter.

### Wortfilter

Die einzige Fähigkeit, die `/messages` nicht hat, und die erhalten bleiben muss:

- Zeileneinfärbung nach Schweregrad wandert auf `TableRow`.
- Das Warndreieck steht am Ende der Nachrichtenzelle.
- `matches` wird an `MessageContent` durchgereicht, das sie an
  `HighlightedMessage` weitergibt.

### Nicht übernommen

Trend-Diagramm, `FilterBar` (Nutzer/Inhalt/Rolle), Pagination und CSV-Export
sind Historienfunktionen und bleiben `/messages` vorbehalten. Der Live-Chat
behält seine Steuerleiste: Channel, Intervall, Pause, Leeren, Nur-Treffer,
Live-Anzeige, Sprungknopf.

## Zustand im Client

Zusätzlich zum heutigen Zustand:

```ts
avatars:      Map<string, { profileImageUrl: string | null; displayName: string | null }>
badgeImages:  Map<string, BadgeSet>                  // channelId
replyTargets: Map<string, { userName; content }>     // messageId
deletedIds:   Set<string>                            // messageId
modCursor:    React.useRef<number>
```

Zwei Namensfallen:

- `ViewerAvatar` heißt sowohl die Komponente
  (`src/components/viewer-avatar.tsx`) als auch das Ergebnis-Interface von
  `getCachedViewerAvatars` (`src/lib/twitch-api.ts:206`). Der Client-Zustand
  benutzt deshalb die ausgeschriebene Form statt des Interface-Namens.
- `BadgeSet` und `BadgeImage` liegen in `src/lib/twitch-api.ts`, das
  `server-only` ist. Der Import in die Client-Dateien muss ein reiner
  `import type` sein – der wird beim Übersetzen restlos entfernt, es entsteht
  also keine Laufzeitabhängigkeit. `src/components/chat-badges.tsx:2` macht es
  bereits genau so. Ein Wertimport aus diesem Modul würde die Seite zur
  Laufzeit sprengen.

Bei Channelwechsel werden `latestId` und `modCursor` auf `0` gesetzt und die
Nachrichten geleert – der Erstabruf-Pfad greift dann wieder. Die Wörterbücher
bleiben erhalten; sie sind ein reiner Cache und bleiben gültig.

## Grenzen

Der Puffer bleibt bei `MAX_MESSAGES = 300`.

Die nach `messageId` verschlüsselten Wörterbücher (`deletedIds`, `replyTargets`)
wüchsen sonst linear mit der Laufzeit. Beim Kürzen des Puffers werden sie auf
das reduziert, was die verbleibenden Nachrichten noch referenzieren. `avatars`
und `badgeImages` sind durch die Zahl der Zuschauer bzw. Channels begrenzt und
werden nicht aufgeräumt.

## Fehlerbehandlung und Rückfälle

- 403 und 500 der Route: unverändert wie heute.
- Ohne hinterlegte Twitch-Zugangsdaten liefert `getCachedBadgeSets` eine leere
  Map. `ChatBadges` fällt dann auf beschriftete Abzeichen und zuletzt auf die
  Boolean-Spalten zurück – der Rückfall ist bereits eingebaut
  (`src/components/chat-badges.tsx:9-12`).
- Fehlende Avatare zeigt `ViewerAvatar` als farbige Initialen.
- `getCachedViewerAvatars` wartet nicht auf die Twitch-API, sondern liefert den
  DB-Cache und lädt Fehlendes im Hintergrund nach
  (`src/lib/twitch-api.ts:212-218`). Ein neuer Zuschauer erscheint also
  spätestens beim nächsten Abruf mit Bild.

## Tests

`src/lib/live-chat-feed.test.ts` prüft die reinen Funktionen:

- Neuer Stapel wird angehängt, bereits bekannte IDs werden übersprungen.
- Puffer wird auf 300 gekürzt, die ältesten fallen heraus.
- Wörterbücher werden über mehrere Stapel akkumuliert, ohne Bestehendes zu
  verlieren.
- `deletedIds` und `replyTargets` verlieren beim Kürzen genau die Einträge,
  die keine Nachricht mehr referenziert.
- Nachgereichte `deletedIds` markieren eine Nachricht, die längst im Puffer
  steht.
- Verschachtelte `badgeImages`-Records werden korrekt in die `BadgeSet`-Form
  überführt.

Die Route selbst bekommt keine eigenen Tests – sie enthält nach dem Schnitt
keine Logik mehr, und das Projekt hat keine Infrastruktur für Integrationstests
gegen die Datenbank.

## Offene Punkte

Keine.

# Channel-Filter aus den aufgezeichneten Daten statt aus der Channel-Tabelle

**Datum:** 2026-07-29
**Status:** Design abgenommen

## Ziel

Die Channel-Dropdowns der Datenseiten listen die Channels, zu denen tatsächlich
Einträge existieren, statt der in `channels` registrierten. Ein gelöschter Channel
bleibt damit filterbar, solange seine Nachrichten, Events oder Moderationsaktionen
in der Datenbank liegen.

## Auslöser

`sql/008_drop_channel_fks.sql` hat die Fremdschlüssel auf `channels` entfernt,
damit ein Channel gelöscht werden kann, ohne seine Aufzeichnungen mitzunehmen.
Dadurch entstehen verwaiste `channel_uuid`-Werte. Konkret hängen an der gelöschten
UUID `e8cb9c03-0b49-4086-a767-43352d3799fc` (`honeypuu`) 4.407 Nachrichten, die
über kein Dropdown mehr erreichbar sind.

## Umfang

### Betroffene Seiten

| Seite | Quelle für die Optionen |
|---|---|
| `/messages` | `messages` |
| `/emotes` | `messages` |
| `/watchlist/hits` | `messages` |
| `/events` | `events` |
| `/moderation` | `moderation_actions` |
| `/viewers/[userId]` | `messages`, eingeschränkt auf diesen Zuschauer |

Das Zuschauerprofil zog seine Optionen schon vorher aus den Daten und war vom
ursprünglichen Problem nicht betroffen. Es gruppierte aber nach Name und bekommt
dieselbe Twitch-ID-Gruppierung, damit ein umbenannter Channel dort nicht doppelt
erscheint. Die Einschränkung auf die Channels des jeweiligen Zuschauers bleibt.

Die drei Export-Routen (`/messages/export`, `/events/export`,
`/moderation/export`) übernehmen den Parameter aus dem Link der jeweiligen Liste
und lösen ihn genauso auf. Ohne das würde der Filter dort stillschweigend
wirkungslos und der Export alle Channels enthalten.

Jede Seite zieht ihre Optionen aus der Tabelle, die sie auch anzeigt. Ein Channel
mit Moderationsaktionen, aber ohne Nachrichten, erscheint deshalb im
Moderations-Filter und nicht im Nachrichten-Filter. Die drei Tabellen enthalten
heute 15, 12 und 16 verschiedene Channels — die Mengen unterscheiden sich also
real.

`/live` gehört ebenfalls dazu, Quelle `messages`. Der erste Abruf lädt den
aktuellen Verlauf (`afterId = 0`), ein gelöschter Channel zeigt dort also seine
letzten Nachrichten statt einer leeren Ansicht. Neue Nachrichten kommen
naturgemäß keine mehr dazu; die Kennzeichnung `(gelöscht)` macht das sichtbar.

Damit das Polling nicht teurer wird, löst die Seite die Twitch-ID einmal beim
Aufbau auf und übergibt die UUIDs an die Client-Komponente. Der Poll schickt sie
kommagetrennt an `/api/live-chat`, sodass dort keine zusätzliche Abfrage je
Intervall anfällt.

### Unverändert

| Seite | Grund |
|---|---|
| `/watchlist` | Das Dropdown ordnet einen Begriff einem Channel zu. Eine Zuordnung zu einem gelöschten Channel ist sinnlos. |

Diese Seite behält `listChannelOptions()` in seiner heutigen Form.

## Identität über die Twitch-ID

Schlüssel der Optionen ist `channel_id`, die Twitch-Broadcaster-ID. Sie ist
stabil, während die beiden Alternativen es nicht sind:

- `channel_uuid` wird bei einer Neuanlage desselben Channels neu vergeben.
- `channel_name` ist ein Snapshot vom Zeitpunkt der Zeile. Nach einer Umbenennung
  bei Twitch stünde derselbe Channel doppelt im Dropdown.

Heute hat noch keine Twitch-ID mehrere UUIDs oder Namen; die Gruppierung ist
Vorsorge und kostet nichts.

## Schnittstelle

Neu in `src/lib/queries/channels.ts`:

```ts
export type ChannelDataSource = "messages" | "events" | "moderation_actions";

export interface ChannelFilterOption {
  /** Twitch-Broadcaster-ID, Wert im URL-Parameter. */
  twitchId: string;
  /** Aktueller Name aus `channels`, sonst der jüngste aus den Daten. */
  name: string;
  /** Alle UUIDs, unter denen dieser Channel aufgezeichnet wurde. */
  uuids: string[];
  /** Kein Eintrag mehr in `channels`. */
  orphaned: boolean;
}

export async function listChannelFilterOptions(
  source: ChannelDataSource,
): Promise<ChannelFilterOption[]>;
```

Ablauf:

1. `SELECT DISTINCT channel_uuid` auf der Quelltabelle.
2. Je UUID die jüngste Zeile für `channel_id` und `channel_name`.
3. Abgleich mit `channels`: existiert der Eintrag, gewinnt dessen Name, sonst
   greift der Name aus Schritt 2 und `orphaned` wird gesetzt.
4. Gruppierung nach `channel_id`, die UUIDs werden zusammengeführt.

Sortierung: vorhandene Channels alphabetisch, verwaiste danach, gekennzeichnet als
`name (gelöscht)`.

## Datenfluss der Filterung

Der URL-Parameter `?channel=` trägt künftig die Twitch-ID statt der UUID. Die
Query-Funktionen nehmen entsprechend `channelUuids: string[]` statt
`channelUuid: string` und filtern mit `channel_uuid IN (…)`.

Gefiltert wird bewusst weiter über `channel_uuid`, nicht über `channel_id`: auf
`channel_id` existiert in keiner der drei Tabellen ein Index, ein Filter darauf
wäre ein Full Scan über 201.428 Zeilen in `messages`. Alle Channel-Indizes führen
mit `channel_uuid`.

Alte Links mit einer UUID im Parameter werden am Format erkannt (36 Zeichen mit
Bindestrichen) und unverändert als UUID behandelt.

## Kosten

`SELECT DISTINCT channel_uuid` läuft über die vorhandenen Indizes als Loose Index
Scan. Gemessen auf der Produktionsdatenbank:

| Tabelle | Zeilen | Gelesene Index-Einträge | Dauer |
|---|---|---|---|
| `messages` | 201.428 | 27 | 79 ms |
| `events` | 2.154 | 25 | 78 ms |
| `moderation_actions` | 1.693 | 33 | 76 ms |

`EXPLAIN` weist für alle drei `Using index for group-by` aus. Die Dauer ist
praktisch reine Netzwerklatenz.

## Tests

`listChannelFilterOptions` bekommt Unit-Tests für die reine Aufbereitungslogik
(Gruppierung nach Twitch-ID, Namensauflösung, `orphaned`-Kennzeichnung,
Sortierung), getrennt vom Datenbankzugriff. Das entspricht dem Vorgehen der
bestehenden Tests unter `src/lib/*.test.ts`, die ebenfalls reine Funktionen prüfen.

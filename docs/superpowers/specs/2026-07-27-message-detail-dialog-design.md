# Nachrichten-Detaildialog

**Datum:** 2026-07-27
**Status:** Entwurf abgenommen
**Baut auf:** `2026-07-27-live-chat-table-design.md` (Branch `feat/live-chat-table`)

## Ziel

Ein Klick auf den Nachrichtentext öffnet einen Dialog mit der vollständigen,
ungeklemmten Nachricht und ihren Details. Gleiches Verhalten in `/messages`
und im Live-Chat.

## Ausgangslage

Beide Tabellen rendern den Nachrichtentext über `MessageContent`, das auf drei
Zeilen klemmt und einen „Mehr anzeigen"-Umschalter anbietet
(`src/components/clamped-content.tsx:41-61`). Der Text ist also nicht hart
abgeschnitten, aber Details wie Antwortkette, Löschgrund oder die getroffenen
Wortfilterbegriffe sind nirgends sichtbar.

Vorhanden und wiederverwendbar:

- `getConversation(messageId)` (`src/lib/queries/twitch.ts:217`) lädt die
  Antwortkette. Twitch verweist immer auf die Ursprungsnachricht, die Kette
  ist deshalb flach. Für eine Nachricht ohne Bezug liefert sie genau einen
  Eintrag: die Nachricht selbst.
- `hasAnyPermission` und `requireAnyPermission` (`src/lib/auth/guard.ts:58-66`).
- Das Dialogmuster aus `src/components/audit/audit-detail-dialog.tsx` samt der
  dort gelernten Barrierefreiheitslektionen.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Auslöser | Nur die Nachrichtenzelle. Nutzername bleibt Link zum Profil. |
| Inhalt | Volltext mit Emote-Bildern und benannten Wortfilter-Treffern, Nutzerblock, Antwortkette, Löschdetails, technische IDs |
| Datenbeschaffung | Der Auslöser kennt nur die `messageId`; der Dialog lädt beim Öffnen alles nach |
| Branch | Direkt auf `feat/live-chat-table` |

## Architektur

### Der Auslöser reicht nur eine ID durch

Die Nachrichtenzelle wird zu einer echten `<button>`, die ausschließlich die
`messageId` kennt. Alles Weitere holt der Dialog beim Öffnen selbst.

Das ist nicht nur bequemer, es löst drei Probleme auf einmal:

- `/messages` bleibt eine Server-Komponente. Es braucht **keine**
  Client-Tabelle wie seinerzeit `/audit`.
- Die Abzeichensätze müssen nicht zum Client serialisiert werden. Der Server
  löst sie für **diese eine** Nachricht auf.
- Der Live-Chat-Feed muss weder `emotes` noch Wortfilter-Treffer zusätzlich
  mitführen.

### API-Vertrag

```
GET /api/messages/detail?messageId=<id>

{
  message: {
    id, messageId, channelId, channelName, userId, userName, displayName,
    color, content, emotes, badges, badgeInfo, bits, isAction,
    isFirstMessage, isBroadcaster, isMod, isVip, isSubscriber,
    receivedAt,                                   // ISO-String
    replyToMessageId,
    matches: TermMatch[],                         // serverseitig ermittelt
    badgeImages: Record<string, Record<string, BadgeImage>>,  // name -> version -> Bild
    avatar: { profileImageUrl, displayName } | null
  },
  conversation: Array<{ …ConversationEntry, receivedAt: string }>,
  deletion: { reason: string | null; occurredAt: string } | null
}
```

Fehlt die Nachricht, antwortet die Route mit 404.

`badgeImages` kommt als verschachteltes Record und wird im Dialog in die
`BadgeSet`-Form (`Map<name, Map<version, BadgeImage>>`) überführt, die
`ChatBadges` über seine `set`-Prop erwartet. Dieselbe Umwandlung wie in
`src/lib/live-chat-feed.ts`, hier aber nur für eine Nachricht.

### Berechtigung

Die Route muss `MESSAGES_VIEW` **oder** `CHAT_LIVE` akzeptieren – sonst sperrt
sie Nutzer aus, die ausschließlich den Live-Chat sehen dürfen.

`guard.ts` bekommt dafür `assertAnyPermission(permissions)`: die werfende
Entsprechung zum vorhandenen `requireAnyPermission`, im selben Muster wie
`assertPermission` (`guard.ts:72-86`).

### Dateistruktur

| Datei | Rolle |
|---|---|
| `src/lib/message-detail.ts` | **neu** – Typen des API-Vertrags und die reine Umwandlung `toBadgeSet` |
| `src/lib/message-detail.test.ts` | **neu** – Vitest gegen `toBadgeSet` |
| `src/lib/queries/message-detail.ts` | **neu** – lädt Nachricht, Kette, Löschung, Abzeichen, Avatar, Wortfilter |
| `src/app/api/messages/detail/route.ts` | **neu** – Auth, Parameter, Aufruf, Fehler |
| `src/components/message-detail-dialog.tsx` | **neu** – der Dialog samt Abruf |
| `src/components/message-cell.tsx` | **neu** – klickbare Zelle, hält den Öffnungszustand |
| `src/lib/auth/guard.ts` | **ändern** – `assertAnyPermission` ergänzen |
| `src/components/clamped-content.tsx` | **ändern** – optionales `expandable` |
| `src/components/message-content.tsx` | **ändern** – `expandable` durchreichen |
| `src/app/(panel)/messages/page.tsx` | **ändern** – `MessageContent` → `MessageCell` |
| `src/app/(panel)/live/live-chat-table.tsx` | **ändern** – dieselbe Zeile |

### Eine erzwungene Konsequenz

Innerhalb der klickbaren Zelle muss „Mehr anzeigen" verschwinden. Eine
`<button>` in einer `<button>` ist ungültiges HTML und bricht die
Tastaturbedienung – der innere Knopf wäre nicht mehr erreichbar.

`ClampedContent` bekommt deshalb ein optionales `expandable` (Vorgabe `true`).
`MessageContent` reicht es durch, `MessageCell` setzt es auf `false`. Die
Klemme auf drei Zeilen bleibt; nur der Umschalter weicht dem Dialog.
`/watchlist/hits` (`src/app/(panel)/watchlist/hits/page.tsx:177`) benutzt
`ClampedContent` direkt und bleibt unverändert.

### Barrierefreiheit

Die Lektionen aus der Audit-Runde gelten unverändert:

- Der Auslöser ist eine echte `<button type="button">`, keine `<div>` mit
  `role="button"` und keine ARIA-Rolle auf einem Tabellenelement.
- Der Dialog setzt `DialogTitle` **und** `DialogDescription`. Radix erwartet
  beides; ein fehlendes `DialogDescription` erzeugt eine Laufzeitwarnung.
- Die Schaltfläche ist blockweise (`block w-full text-left`), damit die
  gesamte Zelle als Trefferfläche dient, ohne verschachtelte Interaktion.

## Zustand und Abruf

`MessageCell` hält nur `open`. `MessageDetailDialog` bekommt `messageId` und
`open` und lädt, sobald `open` auf `true` wechselt.

- Während des Ladens zeigt der Dialog einen Platzhalter.
- Schlägt der Abruf fehl, erscheint eine `Alert` im Dialog; der Dialog bleibt
  bedienbar und schließbar.
- Wird der Dialog vor der Antwort geschlossen, wird der Abruf über einen
  `AbortController` abgebrochen und das Ergebnis verworfen.
- Kein Zwischenspeicher: jedes Öffnen lädt neu. Bei einer Abfrage pro Öffnen
  lohnt sich die Verwaltung eines Caches nicht, und im Live-Chat sind
  Löschstatus und Antwortkette ohnehin veränderlich.

## Inhalt des Dialogs

1. **Kopf** – Kanal und Zeitpunkt als Titel, der Nutzername als Beschreibung.
2. **Nutzerblock** – Avatar, Abzeichen mit Klartext-Titel, Abo-Dauer aus
   `badgeInfo`, Chatfarbe, Link auf `/viewers/<userId>`.
3. **Nachricht** – Volltext ohne Klemme, Emotes als Bilder
   (`showEmoteImages`), Wortfilter-Treffer im Text hervorgehoben **und**
   darunter benannt (Begriff plus Stufe).
4. **Antwortkette** – nur wenn `conversation.length > 1`. Die
   Ursprungsnachricht ist markiert, die geöffnete Nachricht hervorgehoben.
5. **Löschung** – nur wenn vorhanden: Zeitpunkt und Grund. Ein Moderatorname
   wird nicht gespeichert und kann deshalb nicht angezeigt werden.
6. **Technisches** – `messageId`, `userId`, `channelId` in Monospace.

## Nicht enthalten

- Kein Blättern zur vorigen oder nächsten Nachricht.
- Keine Moderationsaktionen aus dem Dialog heraus.
- Kein Zwischenspeicher geöffneter Nachrichten.

## Tests

Der Wert liegt hier in der Verdrahtung, nicht in Rechenlogik. Eine reine
Funktion gibt es: `toBadgeSet`, die Umwandlung von `badgeImages` in die
`BadgeSet`-Form.

Sie liegt bewusst in `src/lib/message-detail.ts` und **nicht** in der
Dialog-Datei: ein Test gegen eine `.tsx`-Datei würde deren React-, Next- und
Icon-Importe in die Node-Testumgebung ziehen. Dieselbe Trennung wie zwischen
`src/lib/live-chat-feed.ts` und `live-chat-table.tsx`.

Die Route erhält keine eigenen Tests: das Projekt hat keine Infrastruktur für
Tests gegen die Datenbank. Verifikation über `tsc`, `npm run build` und eine
Prüfung von Hand.

## Offene Punkte

Keine.

# Live-Chat als Nachrichtentabelle — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Live-Chat zeigt Nachrichten in derselben Tabelle und mit derselben Anreicherung wie `/messages`, behält aber Auto-Scroll, Wortfilter und seine Steuerleiste.

**Architecture:** Die Route `/api/live-chat` liefert neben den Nachrichten drei deduplizierte Wörterbücher (Avatare, Abzeichenbilder, Antwortziele) und einen zweiten Cursor für Löschungen. Der Client führt diese Wörterbücher über Abrufe hinweg in einer `FeedState`-Struktur mit. Die gesamte Misch- und Aufräumlogik liegt in reinen Funktionen und ist ohne DOM und ohne Datenbank testbar.

**Tech Stack:** Next.js 15 App Router, React 19, Drizzle ORM auf MySQL, Tailwind v4, Vitest 3.

Spec: `docs/superpowers/specs/2026-07-27-live-chat-table-design.md`

## Global Constraints

- Sprache aller sichtbaren Texte und aller Code-Kommentare: **Deutsch**.
- **Keine geteilte Komponente wird geändert.** `ChatBadges`, `MessageContent`, `ViewerAvatar`, `ChatName`, `HighlightedMessage` und `src/components/ui/table.tsx` bleiben unangetastet. `src/app/(panel)/messages/page.tsx` wird nicht angefasst.
- `src/lib/twitch-api.ts` ist `server-only`. In Client-Dateien darf daraus **ausschließlich** per `import type` importiert werden (`BadgeImage`, `BadgeSet`). Ein Wertimport sprengt die Seite zur Laufzeit.
- Emote-Bilder bleiben aus: `showEmoteImages` wird **nicht** gesetzt.
- Zeitspalte nutzt `formatDateTime`, nicht `toLocaleTimeString`.
- Puffergrenze bleibt `MAX_MESSAGES = 300`.
- Reihenfolge: älteste oben, neueste unten (bewusst abweichend von `desc` in `/messages`).
- Beim Bauen von Objekten aus DB-Werten nie über die Prototypenkette lesen; auf der Client-Seite werden eingehende Records ausschließlich mit `Object.entries` durchlaufen.

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/lib/live-chat-feed.ts` | **neu** — Typen des API-Vertrags und reine Funktionen: Stapel einmischen, kürzen, Wörterbücher akkumulieren und aufräumen |
| `src/lib/live-chat-feed.test.ts` | **neu** — Vitest gegen genau diese Funktionen |
| `src/lib/queries/live-chat.ts` | **neu** — gesamte serverseitige Anreicherung |
| `src/app/api/live-chat/route.ts` | **ändern** — nur noch Auth, Parameter, Aufruf, Fehlerbehandlung |
| `src/app/(panel)/live/live-chat-table.tsx` | **neu** — rein darstellende Tabelle |
| `src/app/(panel)/live/live-chat.tsx` | **ändern** — Container: Zustand, Abrufschleife, Steuerleiste |

---

### Task 1: Reine Feed-Funktionen

**Files:**
- Create: `src/lib/live-chat-feed.ts`
- Test: `src/lib/live-chat-feed.test.ts`

**Interfaces:**
- Consumes: nichts (erste Aufgabe)
- Produces:
  - `interface LiveMessage`, `interface LiveAvatar`, `interface LiveReplyTarget`, `interface LiveChatPayload`, `interface FeedState`, `interface MergeResult`
  - `function emptyFeedState(): FeedState`
  - `function mergeBatch(state: FeedState, payload: LiveChatPayload, maxMessages: number): MergeResult`

Diese Datei landet im Client-Bündel. Sie darf **nur** `import type` aus `@/lib/twitch-api` benutzen und sonst nichts aus `@/lib/db`, `@/lib/auth` oder anderen Servermodulen.

- [ ] **Step 1: Die Testdatei schreiben**

Erstelle `src/lib/live-chat-feed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyFeedState, mergeBatch, type LiveChatPayload, type LiveMessage } from "./live-chat-feed";

function message(id: number, overrides: Partial<LiveMessage> = {}): LiveMessage {
  return {
    id,
    channelUuid: "kanal-uuid",
    channelId: "12345",
    channelName: "testkanal",
    userId: `user-${id}`,
    userName: `nutzer${id}`,
    displayName: null,
    color: null,
    content: `Nachricht ${id}`,
    bits: 0,
    isMod: false,
    isSubscriber: false,
    isVip: false,
    isBroadcaster: false,
    isFirstMessage: false,
    isAction: false,
    badges: null,
    badgeInfo: null,
    messageId: `msg-${id}`,
    replyToMessageId: null,
    receivedAt: "2026-07-27T12:00:00.000Z",
    matches: [],
    ...overrides,
  };
}

function payload(overrides: Partial<LiveChatPayload> = {}): LiveChatPayload {
  return {
    messages: [],
    latestId: 0,
    modCursor: 0,
    deletedIds: [],
    avatars: {},
    badgeImages: {},
    replyTargets: {},
    ...overrides,
  };
}

describe("mergeBatch", () => {
  it("hängt neue Nachrichten hinten an", () => {
    const first = mergeBatch(emptyFeedState(), payload({ messages: [message(1), message(2)] }), 300);
    const second = mergeBatch(first.state, payload({ messages: [message(3)] }), 300);

    expect(second.state.messages.map((entry) => entry.id)).toEqual([1, 2, 3]);
    expect(second.added).toBe(1);
  });

  it("überspringt bereits bekannte IDs", () => {
    const first = mergeBatch(emptyFeedState(), payload({ messages: [message(1), message(2)] }), 300);
    const second = mergeBatch(first.state, payload({ messages: [message(2), message(3)] }), 300);

    expect(second.state.messages.map((entry) => entry.id)).toEqual([1, 2, 3]);
    expect(second.added).toBe(1);
  });

  it("kürzt auf die Puffergrenze und wirft die ältesten heraus", () => {
    const batch = [message(1), message(2), message(3), message(4)];
    const result = mergeBatch(emptyFeedState(), payload({ messages: batch }), 2);

    expect(result.state.messages.map((entry) => entry.id)).toEqual([3, 4]);
  });

  it("gibt denselben Zustand zurück, wenn der Stapel nichts Neues enthält", () => {
    const first = mergeBatch(emptyFeedState(), payload({ messages: [message(1)] }), 300);
    const second = mergeBatch(first.state, payload({ messages: [message(1)] }), 300);

    expect(second.state).toBe(first.state);
    expect(second.added).toBe(0);
  });

  it("akkumuliert Avatare über mehrere Stapel", () => {
    const first = mergeBatch(
      emptyFeedState(),
      payload({
        messages: [message(1)],
        avatars: { "user-1": { profileImageUrl: "https://bild/1.png", displayName: "Eins" } },
      }),
      300,
    );

    const second = mergeBatch(
      first.state,
      payload({
        messages: [message(2)],
        avatars: { "user-2": { profileImageUrl: "https://bild/2.png", displayName: "Zwei" } },
      }),
      300,
    );

    expect(second.state.avatars.get("user-1")?.profileImageUrl).toBe("https://bild/1.png");
    expect(second.state.avatars.get("user-2")?.profileImageUrl).toBe("https://bild/2.png");
  });

  it("überführt Abzeichenbilder in verschachtelte Maps und ergänzt sie später", () => {
    const first = mergeBatch(
      emptyFeedState(),
      payload({
        messages: [message(1)],
        badgeImages: {
          "12345": {
            moderator: { "1": { title: "Moderator", url1x: "mod1x", url2x: "mod2x" } },
          },
        },
      }),
      300,
    );

    const second = mergeBatch(
      first.state,
      payload({
        messages: [message(2)],
        badgeImages: {
          "12345": {
            subscriber: { "12": { title: "Abonnent", url1x: "sub1x", url2x: "sub2x" } },
          },
        },
      }),
      300,
    );

    const channel = second.state.badgeSets.get("12345");
    expect(channel?.get("moderator")?.get("1")?.url1x).toBe("mod1x");
    expect(channel?.get("subscriber")?.get("12")?.url1x).toBe("sub1x");
  });

  it("markiert eine Nachricht, die längst im Puffer steht, als gelöscht", () => {
    const first = mergeBatch(emptyFeedState(), payload({ messages: [message(1)] }), 300);
    const second = mergeBatch(first.state, payload({ deletedIds: ["msg-1"] }), 300);

    expect(second.state.deletedIds.has("msg-1")).toBe(true);
    expect(second.added).toBe(0);
  });

  it("räumt beim Kürzen die Einträge weg, die keine Nachricht mehr referenziert", () => {
    const first = mergeBatch(
      emptyFeedState(),
      payload({
        messages: [message(1, { replyToMessageId: "msg-alt" }), message(2)],
        deletedIds: ["msg-1", "msg-2"],
        replyTargets: { "msg-alt": { userName: "Alt", content: "alter Text" } },
      }),
      2,
    );

    expect(first.state.deletedIds.has("msg-1")).toBe(true);
    expect(first.state.replyTargets.has("msg-alt")).toBe(true);

    // Nachricht 1 fällt aus dem Puffer – ihr Löschvermerk und ihr Antwortziel auch.
    const second = mergeBatch(first.state, payload({ messages: [message(3)] }), 2);

    expect(second.state.messages.map((entry) => entry.id)).toEqual([2, 3]);
    expect(second.state.deletedIds.has("msg-1")).toBe(false);
    expect(second.state.deletedIds.has("msg-2")).toBe(true);
    expect(second.state.replyTargets.has("msg-alt")).toBe(false);
  });

  it("behält Avatare auch für Nachrichten, die aus dem Puffer gefallen sind", () => {
    const first = mergeBatch(
      emptyFeedState(),
      payload({
        messages: [message(1)],
        avatars: { "user-1": { profileImageUrl: "https://bild/1.png", displayName: "Eins" } },
      }),
      1,
    );

    const second = mergeBatch(first.state, payload({ messages: [message(2)] }), 1);

    expect(second.state.messages.map((entry) => entry.id)).toEqual([2]);
    expect(second.state.avatars.has("user-1")).toBe(true);
  });
});
```

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestätigen**

Run: `npx vitest run src/lib/live-chat-feed.test.ts`
Expected: FAIL — `Failed to resolve import "./live-chat-feed"`.

- [ ] **Step 3: Das Modul schreiben**

Erstelle `src/lib/live-chat-feed.ts`:

```ts
/**
 * Zustand und Mischlogik des Live-Chat-Stroms.
 *
 * Bewusst frei von Server- und React-Abhängigkeiten: die Route liefert
 * JSON-Records, der Client führt daraus Maps mit. Beides trifft sich hier,
 * damit die Logik ohne DOM und ohne Datenbank prüfbar bleibt.
 */

import type { BadgeImage, BadgeSet } from "@/lib/twitch-api";
import type { TermMatch } from "@/lib/watchlist";

export interface LiveMessage {
  id: number;
  channelUuid: string;
  channelId: string;
  channelName: string;
  userId: string;
  userName: string;
  displayName: string | null;
  color: string | null;
  content: string;
  bits: number;
  isMod: boolean;
  isSubscriber: boolean;
  isVip: boolean;
  isBroadcaster: boolean;
  isFirstMessage: boolean;
  isAction: boolean;
  badges: string | null;
  badgeInfo: string | null;
  messageId: string;
  replyToMessageId: string | null;
  receivedAt: string;
  matches: TermMatch[];
}

export interface LiveAvatar {
  profileImageUrl: string | null;
  displayName: string | null;
}

export interface LiveReplyTarget {
  userName: string;
  content: string;
}

/** Antwort von /api/live-chat – reine Records, damit sie durch JSON passen. */
export interface LiveChatPayload {
  messages: LiveMessage[];
  latestId: number;
  /** Höchste gesehene moderation_actions.id. */
  modCursor: number;
  deletedIds: string[];
  avatars: Record<string, LiveAvatar>;
  /** channelId -> Abzeichenname -> Version -> Bild. */
  badgeImages: Record<string, Record<string, Record<string, BadgeImage>>>;
  replyTargets: Record<string, LiveReplyTarget>;
}

export interface FeedState {
  messages: LiveMessage[];
  avatars: Map<string, LiveAvatar>;
  /** Genau die Form, die ChatBadges über seine set-Prop erwartet. */
  badgeSets: Map<string, BadgeSet>;
  replyTargets: Map<string, LiveReplyTarget>;
  deletedIds: Set<string>;
}

export interface MergeResult {
  state: FeedState;
  /** Wie viele Nachrichten wirklich neu hinzugekommen sind. */
  added: number;
}

export function emptyFeedState(): FeedState {
  return {
    messages: [],
    avatars: new Map(),
    badgeSets: new Map(),
    replyTargets: new Map(),
    deletedIds: new Set(),
  };
}

/**
 * Mischt einen Stapel in den Zustand.
 *
 * Gibt denselben Zustand zurück, wenn der Stapel nichts beiträgt – sonst
 * würde jeder Abruf ein Neuzeichnen auslösen, auch wenn der Chat still ist.
 */
export function mergeBatch(state: FeedState, payload: LiveChatPayload, maxMessages: number): MergeResult {
  const known = new Set(state.messages.map((entry) => entry.id));
  const fresh = payload.messages.filter((entry) => !known.has(entry.id));

  const hasDictionaryUpdate =
    payload.deletedIds.length > 0 ||
    Object.keys(payload.avatars).length > 0 ||
    Object.keys(payload.badgeImages).length > 0 ||
    Object.keys(payload.replyTargets).length > 0;

  if (fresh.length === 0 && !hasDictionaryUpdate) {
    return { state, added: 0 };
  }

  const merged = [...state.messages, ...fresh];
  const messages = merged.length > maxMessages ? merged.slice(merged.length - maxMessages) : merged;

  const avatars = new Map(state.avatars);
  for (const [userId, avatar] of Object.entries(payload.avatars)) {
    avatars.set(userId, avatar);
  }

  const replyTargets = new Map(state.replyTargets);
  for (const [messageId, target] of Object.entries(payload.replyTargets)) {
    replyTargets.set(messageId, target);
  }

  const deletedIds = new Set(state.deletedIds);
  for (const messageId of payload.deletedIds) {
    deletedIds.add(messageId);
  }

  return {
    state: {
      messages,
      avatars,
      badgeSets: mergeBadgeImages(state.badgeSets, payload.badgeImages),
      // Nach messageId verschlüsselt: wächst sonst linear mit der Laufzeit.
      replyTargets: pruneReplyTargets(replyTargets, messages),
      deletedIds: pruneDeletedIds(deletedIds, messages),
    },
    added: fresh.length,
  };
}

/** Verschachtelte Records aus dem JSON in die Map-Form von ChatBadges überführen. */
function mergeBadgeImages(
  existing: Map<string, BadgeSet>,
  incoming: Record<string, Record<string, Record<string, BadgeImage>>>,
): Map<string, BadgeSet> {
  if (Object.keys(incoming).length === 0) return existing;

  const result = new Map(existing);

  for (const [channelId, names] of Object.entries(incoming)) {
    const channelSet: BadgeSet = new Map(result.get(channelId));

    for (const [name, versions] of Object.entries(names)) {
      const versionMap = new Map(channelSet.get(name));

      for (const [version, image] of Object.entries(versions)) {
        versionMap.set(version, image);
      }

      channelSet.set(name, versionMap);
    }

    result.set(channelId, channelSet);
  }

  return result;
}

function pruneDeletedIds(deletedIds: Set<string>, messages: LiveMessage[]): Set<string> {
  const alive = new Set(messages.map((entry) => entry.messageId));
  const result = new Set<string>();

  for (const messageId of deletedIds) {
    if (alive.has(messageId)) result.add(messageId);
  }

  return result;
}

function pruneReplyTargets(
  replyTargets: Map<string, LiveReplyTarget>,
  messages: LiveMessage[],
): Map<string, LiveReplyTarget> {
  const referenced = new Set(
    messages.map((entry) => entry.replyToMessageId).filter((id): id is string => Boolean(id)),
  );

  const result = new Map<string, LiveReplyTarget>();

  for (const [messageId, target] of replyTargets) {
    if (referenced.has(messageId)) result.set(messageId, target);
  }

  return result;
}
```

- [ ] **Step 4: Tests laufen lassen und grün bestätigen**

Run: `npx vitest run src/lib/live-chat-feed.test.ts`
Expected: PASS — 9 Tests, keine Warnungen.

- [ ] **Step 5: Typprüfung**

Run: `npx tsc --noEmit`
Expected: Exit 0, keine Ausgabe.

- [ ] **Step 6: Commit**

```bash
git add src/lib/live-chat-feed.ts src/lib/live-chat-feed.test.ts
git commit -m "Add pure merge logic for the live chat feed"
```

---

### Task 2: Serverseitige Anreicherung

**Files:**
- Create: `src/lib/queries/live-chat.ts`
- Modify: `src/app/api/live-chat/route.ts` (vollständig ersetzen)

**Interfaces:**
- Consumes: `LiveChatPayload`, `LiveMessage`, `LiveReplyTarget` aus `src/lib/live-chat-feed.ts` (Task 1)
- Produces: `interface LiveChatQuery`, `function loadLiveChat(query: LiveChatQuery): Promise<LiveChatPayload>`

Diese Aufgabe hat keine Unit-Tests: das Projekt besitzt keine Infrastruktur für Tests gegen die Datenbank. Verifikation erfolgt über `npx tsc --noEmit` und `npm run build`.

- [ ] **Step 1: Das Abfragemodul schreiben**

Erstelle `src/lib/queries/live-chat.ts`:

```ts
import "server-only";

import { and, desc, eq, gt, inArray, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages, moderationActions } from "@/lib/db/schema";
import type { BadgeImage, BadgeSet } from "@/lib/twitch-api";
import { getCachedBadgeSets, getCachedViewerAvatars } from "@/lib/twitch-api";
import { getActiveWatchTerms } from "@/lib/queries/watchlist";
import { parseBadges } from "@/lib/twitch-tags";
import { findMatches } from "@/lib/watchlist";
import type { LiveChatPayload, LiveMessage, LiveReplyTarget } from "@/lib/live-chat-feed";

/** Obergrenze für nachgereichte Löschungen pro Abruf. */
const MAX_DELETIONS = 200;

export interface LiveChatQuery {
  channelUuid?: string;
  /** Cursor auf messages.id; 0 lädt den aktuellen Verlauf. */
  afterId: number;
  /** Cursor auf moderation_actions.id; 0 bedeutet Erstabruf. */
  modAfter: number;
  limit: number;
}

/**
 * Lädt neue Chatnachrichten samt allem, was die Anzeige dafür braucht.
 *
 * Avatare, Abzeichenbilder und Antwortziele kommen dedupliziert als
 * Wörterbücher zurück – der Client führt sie über Abrufe hinweg mit, sodass
 * dieselben Bilder nicht bei jedem Poll erneut über die Leitung gehen.
 */
export async function loadLiveChat(query: LiveChatQuery): Promise<LiveChatPayload> {
  const conditions: SQL[] = [];
  if (query.channelUuid) conditions.push(eq(messages.channelUuid, query.channelUuid));
  if (Number.isFinite(query.afterId) && query.afterId > 0) conditions.push(gt(messages.id, query.afterId));

  const rows = await db
    .select({
      id: messages.id,
      channelUuid: messages.channelUuid,
      channelId: messages.channelId,
      channelName: messages.channelName,
      userId: messages.userId,
      userName: messages.userName,
      displayName: messages.displayName,
      color: messages.color,
      content: messages.content,
      bits: messages.bits,
      isMod: messages.isMod,
      isSubscriber: messages.isSubscriber,
      isVip: messages.isVip,
      isBroadcaster: messages.isBroadcaster,
      isFirstMessage: messages.isFirstMessage,
      isAction: messages.isAction,
      badges: messages.badges,
      badgeInfo: messages.badgeInfo,
      messageId: messages.messageId,
      replyToMessageId: messages.replyToMessageId,
      receivedAt: messages.receivedAt,
    })
    .from(messages)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(messages.id))
    .limit(query.limit);

  const terms = await getActiveWatchTerms();

  // Älteste zuerst, damit die Liste chronologisch wächst.
  const ordered: LiveMessage[] = rows.reverse().map((row) => ({
    ...row,
    receivedAt: row.receivedAt.toISOString(),
    matches: findMatches(row.content, terms, row.channelUuid),
  }));

  const [avatarMap, badgeSetMap, deletions, replyTargets] = await Promise.all([
    getCachedViewerAvatars(ordered.map((entry) => entry.userId)),
    getCachedBadgeSets(ordered.map((entry) => entry.channelId)),
    loadDeletions(ordered, query.modAfter),
    loadReplyTargets(ordered),
  ]);

  const avatars: Record<string, { profileImageUrl: string | null; displayName: string | null }> = {};
  for (const [userId, entry] of avatarMap) {
    avatars[userId] = { profileImageUrl: entry.profileImageUrl, displayName: entry.displayName };
  }

  return {
    messages: ordered,
    latestId: ordered.length > 0 ? ordered[ordered.length - 1].id : query.afterId,
    modCursor: deletions.cursor,
    deletedIds: deletions.ids,
    avatars,
    badgeImages: usedBadgeImages(ordered, badgeSetMap),
    replyTargets,
  };
}

/**
 * Reduziert die Abzeichensätze auf die Bilder, die dieser Stapel wirklich
 * benutzt. Ein kompletter Satz enthält alle globalen Abzeichen und wäre pro
 * Abruf um Größenordnungen zu schwer.
 */
function usedBadgeImages(
  items: LiveMessage[],
  sets: Map<string, BadgeSet>,
): Record<string, Record<string, Record<string, BadgeImage>>> {
  const result: Record<string, Record<string, Record<string, BadgeImage>>> = {};

  for (const message of items) {
    const set = sets.get(message.channelId);
    if (!set) continue;

    for (const badge of parseBadges(message.badges, message.badgeInfo)) {
      const image = set.get(badge.name)?.get(badge.version);
      if (!image) continue;

      const names = (result[message.channelId] ??= {});
      const versions = (names[badge.name] ??= {});
      versions[badge.version] = image;
    }
  }

  return result;
}

/**
 * Löschungen für diesen Abruf.
 *
 * Beim Erstabruf (modAfter <= 0) nur die des aktuellen Stapels – sonst käme
 * die gesamte Historie zurück. Danach inkrementell über den Cursor, sodass
 * auch Nachrichten markiert werden, die längst im Client-Puffer liegen.
 */
async function loadDeletions(
  items: LiveMessage[],
  modAfter: number,
): Promise<{ ids: string[]; cursor: number }> {
  if (!Number.isFinite(modAfter) || modAfter <= 0) {
    const messageIds = items.map((entry) => entry.messageId).filter(Boolean);

    const [deleted, head] = await Promise.all([
      messageIds.length > 0
        ? db
            .select({ deletedMessageId: moderationActions.deletedMessageId })
            .from(moderationActions)
            .where(inArray(moderationActions.deletedMessageId, messageIds))
        : Promise.resolve([]),

      db.select({ id: moderationActions.id }).from(moderationActions).orderBy(desc(moderationActions.id)).limit(1),
    ]);

    return {
      ids: deleted.map((row) => row.deletedMessageId).filter((id): id is string => Boolean(id)),
      cursor: head[0]?.id ?? 0,
    };
  }

  const rows = await db
    .select({ id: moderationActions.id, deletedMessageId: moderationActions.deletedMessageId })
    .from(moderationActions)
    .where(gt(moderationActions.id, modAfter))
    .orderBy(moderationActions.id)
    .limit(MAX_DELETIONS);

  return {
    ids: rows.map((row) => row.deletedMessageId).filter((id): id is string => Boolean(id)),
    // Bei mehr als MAX_DELETIONS rückt der Cursor nur bis hierher – der
    // nächste Abruf holt den Rest nach, es geht nichts verloren.
    cursor: rows.length > 0 ? rows[rows.length - 1].id : modAfter,
  };
}

async function loadReplyTargets(items: LiveMessage[]): Promise<Record<string, LiveReplyTarget>> {
  const replyIds = [
    ...new Set(items.map((entry) => entry.replyToMessageId).filter((id): id is string => Boolean(id))),
  ];

  if (replyIds.length === 0) return {};

  const targets = await db
    .select({
      messageId: messages.messageId,
      userName: messages.userName,
      displayName: messages.displayName,
      content: messages.content,
    })
    .from(messages)
    .where(inArray(messages.messageId, replyIds));

  const result: Record<string, LiveReplyTarget> = {};
  for (const row of targets) {
    result[row.messageId] = { userName: row.displayName ?? row.userName, content: row.content };
  }

  return result;
}
```

- [ ] **Step 2: Die Route auf das Modul umstellen**

Ersetze `src/app/api/live-chat/route.ts` vollständig durch:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { AuthorizationError, assertPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { loadLiveChat } from "@/lib/queries/live-chat";

/**
 * Liefert neue Chatnachrichten für die Live-Ansicht.
 *
 * Bewusst als einfaches Polling statt WebSocket: der Bot schreibt in die
 * Datenbank, das Panel liest daraus. Ein Push-Kanal wäre zusätzliche
 * Infrastruktur ohne echten Gewinn bei Intervallen von wenigen Sekunden.
 */

const MAX_BATCH = 200;
const DEFAULT_BATCH = 60;

function positiveNumber(raw: string | null, fallback: number): number {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function GET(request: NextRequest) {
  try {
    await assertPermission(PERMISSIONS.CHAT_LIVE);

    const params = request.nextUrl.searchParams;

    const payload = await loadLiveChat({
      channelUuid: params.get("channel") ?? undefined,
      afterId: positiveNumber(params.get("after"), 0),
      modAfter: positiveNumber(params.get("modAfter"), 0),
      limit: Math.min(positiveNumber(params.get("limit"), DEFAULT_BATCH), MAX_BATCH),
    });

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[live-chat]", error);
    return NextResponse.json({ error: "Nachrichten konnten nicht geladen werden." }, { status: 500 });
  }
}
```

Hinweis: `positiveNumber` liefert für `after=0` und `modAfter=0` die 0 zurück (Fallback), was genau dem Erstabruf-Pfad entspricht.

- [ ] **Step 3: Typprüfung**

Run: `npx tsc --noEmit`
Expected: Exit 0.

Erwarteter Fehler, falls er auftritt: `src/app/(panel)/live/live-chat.tsx` benutzt noch die alte Antwortform. Das ist normal — Task 4 stellt den Container um. Falls `tsc` nur dort meckert, weiter zu Step 4; jeder andere Fehler muss hier behoben werden.

- [ ] **Step 4: Bestehende Tests laufen lassen**

Run: `npx vitest run`
Expected: PASS — alle Tests aus Task 1 und `audit-diff` weiterhin grün.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/live-chat.ts src/app/api/live-chat/route.ts
git commit -m "Enrich the live chat route with avatars, badges and replies"
```

---

### Task 3: Tabellenkomponente

**Files:**
- Create: `src/app/(panel)/live/live-chat-table.tsx`

**Interfaces:**
- Consumes: `FeedState`, `LiveMessage` aus `src/lib/live-chat-feed.ts` (Task 1)
- Produces: `function LiveChatTable(props: LiveChatTableProps)` mit
  `interface LiveChatTableProps { messages: LiveMessage[]; feed: FeedState; emptyLabel: string }`

Rein darstellend: keine Zustandshaltung, kein Datenabruf. Die Komponente bekommt die bereits gefilterte Liste, damit der Trefferfilter beim Container bleibt.

- [ ] **Step 1: Die Komponente schreiben**

Erstelle `src/app/(panel)/live/live-chat-table.tsx`:

```tsx
"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { ChatBadges } from "@/components/chat-badges";
import { ChatName } from "@/components/chat-name";
import { MessageContent } from "@/components/message-content";
import { ViewerAvatar } from "@/components/viewer-avatar";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FeedState, LiveMessage } from "@/lib/live-chat-feed";
import { cn, formatDateTime } from "@/lib/utils";
import { highestSeverity, severityStyle } from "@/lib/watchlist";

interface LiveChatTableProps {
  /** Bereits gefilterte Liste – der Trefferfilter liegt beim Container. */
  messages: LiveMessage[];
  feed: FeedState;
  emptyLabel: string;
}

/** Zeileneinfärbung nach der höchsten Wortfilterstufe der Nachricht. */
const ROW_TINT: Record<string, string> = {
  critical:
    "bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-destructive)_16%,transparent)]",
  warning:
    "bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)]",
  info: "bg-[color-mix(in_srgb,var(--color-info)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-info)_14%,transparent)]",
};

const ICON_TINT: Record<string, string> = {
  critical: "text-[var(--color-destructive)]",
  warning: "text-[var(--color-warning)]",
  info: "text-[var(--color-info)]",
};

export function LiveChatTable({ messages, feed, emptyLabel }: LiveChatTableProps) {
  return (
    <Table>
      <TableHeader className="sticky top-0 z-10 bg-[var(--color-card)]">
        <TableRow>
          <TableHead className="w-40">Zeit</TableHead>
          <TableHead className="w-32">Channel</TableHead>
          <TableHead className="w-48">Nutzer</TableHead>
          <TableHead>Nachricht</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {messages.length === 0 ? (
          <TableEmpty colSpan={4} title={emptyLabel} />
        ) : (
          messages.map((message) => {
            const severity = highestSeverity(message.matches);
            const avatar = feed.avatars.get(message.userId);
            const name = message.displayName ?? message.userName;

            return (
              <TableRow key={message.id} className={severity ? ROW_TINT[severity] : undefined}>
                <TableCell className="whitespace-nowrap text-meta">{formatDateTime(message.receivedAt)}</TableCell>

                <TableCell className="text-meta">{message.channelName}</TableCell>

                <TableCell>
                  <div className="flex items-center gap-2">
                    <ViewerAvatar
                      name={name}
                      imageUrl={avatar?.profileImageUrl}
                      color={message.color}
                      size="sm"
                    />

                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                      <ChatBadges
                        badges={message.badges}
                        badgeInfo={message.badgeInfo}
                        set={feed.badgeSets.get(message.channelId)}
                        isBroadcaster={message.isBroadcaster}
                        isMod={message.isMod}
                        isVip={message.isVip}
                        isSubscriber={message.isSubscriber}
                      />
                      <Link href={`/viewers/${message.userId}`} className="max-w-28 truncate hover:underline">
                        <ChatName color={message.color} className="font-medium">
                          {name}
                        </ChatName>
                      </Link>
                    </div>
                  </div>
                </TableCell>

                <TableCell className="max-w-xl">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <MessageContent
                        content={message.content}
                        badgeInfo={message.badgeInfo}
                        isAction={message.isAction}
                        bits={message.bits}
                        isFirstMessage={message.isFirstMessage}
                        isDeleted={feed.deletedIds.has(message.messageId)}
                        replyTo={
                          message.replyToMessageId
                            ? (feed.replyTargets.get(message.replyToMessageId) ?? null)
                            : null
                        }
                        matches={message.matches}
                      />
                    </div>

                    {severity && (
                      <AlertTriangle
                        className={cn("mt-0.5 size-3.5 shrink-0", ICON_TINT[severity])}
                        aria-label={`Wortfilter: ${severityStyle(severity).label}`}
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Typprüfung**

Run: `npx tsc --noEmit`
Expected: Exit 0 oder ausschließlich Fehler in `src/app/(panel)/live/live-chat.tsx` (wird in Task 4 umgestellt).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(panel)/live/live-chat-table.tsx"
git commit -m "Add the live chat message table"
```

---

### Task 4: Container verdrahten

**Files:**
- Modify: `src/app/(panel)/live/live-chat.tsx` (vollständig ersetzen)

**Interfaces:**
- Consumes: `emptyFeedState`, `mergeBatch`, `LiveChatPayload`, `FeedState` aus `src/lib/live-chat-feed.ts` (Task 1); `LiveChatTable` aus `./live-chat-table` (Task 3)
- Produces: nichts für spätere Aufgaben

- [ ] **Step 1: Den Container ersetzen**

Ersetze `src/app/(panel)/live/live-chat.tsx` vollständig durch:

```tsx
"use client";

import * as React from "react";
import { ArrowDown, Filter, Pause, Play, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { emptyFeedState, mergeBatch, type LiveChatPayload } from "@/lib/live-chat-feed";
import { cn, formatNumber } from "@/lib/utils";
import { LiveChatTable } from "./live-chat-table";

interface LiveChatProps {
  channels: Array<{ uuid: string; name: string }>;
  /** Vorausgewählter Channel aus der URL. */
  initialChannel?: string;
}

const REFRESH_OPTIONS = [
  { value: 2000, label: "2 Sekunden" },
  { value: 5000, label: "5 Sekunden" },
  { value: 15000, label: "15 Sekunden" },
];

/** Mehr Nachrichten braucht niemand im Blick – ältere werden verworfen. */
const MAX_MESSAGES = 300;

export function LiveChat({ channels, initialChannel }: LiveChatProps) {
  const [channel, setChannel] = React.useState(initialChannel ?? "");
  const [interval, setIntervalMs] = React.useState(5000);
  const [paused, setPaused] = React.useState(false);
  const [onlyHits, setOnlyHits] = React.useState(false);
  const [feed, setFeed] = React.useState(emptyFeedState);
  const [error, setError] = React.useState<string | null>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  const [newCount, setNewCount] = React.useState(0);

  const latestId = React.useRef(0);
  /** Zweiter Cursor: trägt Löschungen nach, die nach dem Eintreffen passieren. */
  const modCursor = React.useRef(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  /** Verhindert, dass sich zwei Abrufe überlappen und dieselben Nachrichten doppelt liefern. */
  const inFlight = React.useRef(false);
  /** Als Ref, damit ein Scrollwechsel nicht die Abrufschleife neu aufsetzt. */
  const atBottomRef = React.useRef(true);

  React.useEffect(() => {
    atBottomRef.current = atBottom;
  }, [atBottom]);

  // Bei Channelwechsel von vorn beginnen. Beide Cursor zurück auf 0, damit
  // wieder der Erstabruf-Pfad greift; die Wörterbücher bleiben als Cache.
  React.useEffect(() => {
    latestId.current = 0;
    modCursor.current = 0;
    setFeed(emptyFeedState());
    setNewCount(0);
  }, [channel]);

  const fetchMessages = React.useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;

    try {
      const params = new URLSearchParams();
      if (channel) params.set("channel", channel);
      params.set("after", String(latestId.current));
      params.set("modAfter", String(modCursor.current));

      const response = await fetch(`/api/live-chat?${params.toString()}`, { cache: "no-store" });

      if (!response.ok) {
        setError(response.status === 403 ? "Keine Berechtigung für den Live-Chat." : "Verbindung fehlgeschlagen.");
        return;
      }

      const payload = (await response.json()) as LiveChatPayload;
      setError(null);

      latestId.current = Math.max(latestId.current, payload.latestId);
      modCursor.current = Math.max(modCursor.current, payload.modCursor);

      setFeed((previous) => {
        const { state, added } = mergeBatch(previous, payload, MAX_MESSAGES);
        if (added > 0 && !atBottomRef.current) setNewCount((count) => count + added);
        return state;
      });
    } catch {
      setError("Verbindung fehlgeschlagen.");
    } finally {
      inFlight.current = false;
    }
  }, [channel]);

  // Abrufschleife
  React.useEffect(() => {
    void fetchMessages();
    if (paused) return;

    const timer = window.setInterval(() => void fetchMessages(), interval);
    return () => window.clearInterval(timer);
  }, [fetchMessages, interval, paused]);

  // Automatisch nach unten scrollen, solange der Nutzer dort steht.
  React.useEffect(() => {
    if (!atBottom || paused) return;
    const container = containerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [feed, atBottom, paused]);

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const bottom = distance < 60;

    setAtBottom(bottom);
    if (bottom) setNewCount(0);
  }

  function scrollToBottom() {
    const container = containerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
    setAtBottom(true);
    setNewCount(0);
  }

  const visible = onlyHits ? feed.messages.filter((message) => message.matches.length > 0) : feed.messages;
  const hitCount = feed.messages.filter((message) => message.matches.length > 0).length;

  return (
    <div className="space-y-3">
      {/* Steuerleiste */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3.5 ring-inset-subtle">
        <div className="w-full space-y-1.5 sm:w-52">
          <span className="block text-xs font-medium text-[var(--color-muted-foreground)]">Channel</span>
          <Select value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="">Alle Channels</option>
            {channels.map((entry) => (
              <option key={entry.uuid} value={entry.uuid}>
                {entry.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-full space-y-1.5 sm:w-40">
          <span className="block text-xs font-medium text-[var(--color-muted-foreground)]">Aktualisierung</span>
          <Select value={interval} onChange={(event) => setIntervalMs(Number(event.target.value))}>
            {REFRESH_OPTIONS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant={paused ? "default" : "outline"} size="sm" onClick={() => setPaused((value) => !value)}>
            {paused ? <Play /> : <Pause />}
            {paused ? "Fortsetzen" : "Pause"}
          </Button>

          <Button variant="outline" size="sm" onClick={() => setFeed(emptyFeedState())}>
            <Trash2 />
            Leeren
          </Button>
        </div>

        <Button
          type="button"
          variant={onlyHits ? "default" : "outline"}
          size="sm"
          onClick={() => setOnlyHits((value) => !value)}
          aria-pressed={onlyHits}
        >
          <Filter />
          Nur Wortfilter-Treffer
          {hitCount > 0 && <Badge variant="warning">{formatNumber(hitCount)}</Badge>}
        </Button>

        <span className="ml-auto flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
          <span
            className={cn(
              "size-2 rounded-full",
              paused ? "bg-[var(--color-subtle)]" : "animate-pulse bg-[var(--color-success)]",
            )}
          />
          {paused ? "Pausiert" : "Live"}
          <span className="text-[var(--color-subtle)]">· {formatNumber(feed.messages.length)} im Puffer</span>
        </span>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {/* Nachrichtenstrom */}
      <div className="relative">
        <div
          ref={containerRef}
          onScroll={onScroll}
          className="h-[60vh] overflow-y-auto scrollbar-thin rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] ring-inset-subtle"
        >
          <LiveChatTable
            messages={visible}
            feed={feed}
            emptyLabel={onlyHits ? "Noch keine Treffer." : "Warte auf Nachrichten…"}
          />
        </div>

        {/* Sprungknopf, wenn während des Lesens neue Nachrichten kamen */}
        {!atBottom && (
          <Button
            size="sm"
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-overlay"
          >
            <ArrowDown />
            {newCount > 0 ? `${formatNumber(newCount)} neue Nachrichten` : "Nach unten"}
          </Button>
        )}
      </div>
    </div>
  );
}
```

Beachte: `p-3` ist vom Scroll-Container entfernt worden — die Tabelle bringt ihre eigenen Zellabstände mit, ein zusätzliches Polster würde den `sticky`-Kopf von der Oberkante lösen.

- [ ] **Step 2: Typprüfung**

Run: `npx tsc --noEmit`
Expected: Exit 0, keine Ausgabe.

- [ ] **Step 3: Tests laufen lassen**

Run: `npx vitest run`
Expected: PASS — alle Tests grün, Ausgabe ohne Warnungen.

- [ ] **Step 4: Produktionsbau**

Run: `npm run build`
Expected: Erfolg, alle Routen werden ausgegeben, keine Fehler zu `server-only` oder zu Client-Grenzen.

Falls hier ein Fehler zu `server-only` erscheint: in einer der Client-Dateien wurde `@/lib/twitch-api` als Wert statt per `import type` eingebunden. Das ist die einzige erwartete Fehlerquelle an dieser Stelle.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(panel)/live/live-chat.tsx"
git commit -m "Render the live chat as a message table"
```

---

## Verifikation von Hand

Nach Task 4 in einer angemeldeten Browsersitzung auf `/live` prüfen:

1. Die Tabelle hat die vier Spalten Zeit, Channel, Nutzer, Nachricht; der Kopf bleibt beim Scrollen stehen.
2. Neue Nachrichten kommen unten dazu, die Ansicht scrollt automatisch mit.
3. Nach oben scrollen: der Sprungknopf erscheint und zählt neue Nachrichten.
4. Nutzer mit Abzeichen zeigen echte Abzeichenbilder, Nutzer mit Profilbild zeigen ihren Avatar.
5. Eine Antwort im Chat zeigt „Antwort auf …" über dem Text.
6. Eine Nachricht, die **während** der Beobachtung von einem Moderator gelöscht wird, bekommt spätestens beim übernächsten Abruf die Gelöscht-Markierung.
7. Ein Wortfilter-Treffer färbt die Zeile und hebt den Begriff im Text hervor; das Warndreieck steht rechts.
8. „Nur Wortfilter-Treffer" filtert; bei keinem Treffer erscheint „Noch keine Treffer."
9. Channelwechsel leert die Ansicht und lädt den Verlauf des neuen Channels.
10. `/messages` sieht unverändert aus.

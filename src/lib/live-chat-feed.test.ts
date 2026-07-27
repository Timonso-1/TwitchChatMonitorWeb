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

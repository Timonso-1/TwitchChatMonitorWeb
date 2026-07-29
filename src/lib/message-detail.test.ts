import { describe, expect, it } from "vitest";
import { sliceSurrounding, toBadgeSet, type SurroundingMessage } from "./message-detail";

describe("toBadgeSet", () => {
  it("liefert für ein leeres Record eine leere Map", () => {
    expect(toBadgeSet({}).size).toBe(0);
  });

  it("überführt Name und Version in verschachtelte Maps", () => {
    const set = toBadgeSet({
      moderator: { "1": { title: "Moderator", url1x: "mod1x", url2x: "mod2x" } },
    });

    expect(set.get("moderator")?.get("1")?.title).toBe("Moderator");
    expect(set.get("moderator")?.get("1")?.url1x).toBe("mod1x");
  });

  it("behält mehrere Abzeichen und mehrere Versionen", () => {
    const set = toBadgeSet({
      subscriber: {
        "1": { title: "Abonnent", url1x: "sub1", url2x: "sub1@2" },
        "12": { title: "Abonnent 1 Jahr", url1x: "sub12", url2x: "sub12@2" },
      },
      vip: { "1": { title: "VIP", url1x: "vip1", url2x: "vip1@2" } },
    });

    expect(set.size).toBe(2);
    expect(set.get("subscriber")?.size).toBe(2);
    expect(set.get("subscriber")?.get("12")?.title).toBe("Abonnent 1 Jahr");
    expect(set.get("vip")?.get("1")?.url1x).toBe("vip1");
  });

  it("liest keine Prototyp-Eigenschaften mit", () => {
    // Object.entries sieht nur eigene Schlüssel. Ein per JSON.parse erzeugtes
    // "__proto__" ist eine echte Eigenschaft und muss als normaler Name
    // durchgereicht werden – ohne dass Object.prototype in die Map gerät.
    const parsed = JSON.parse('{"__proto__":{"1":{"title":"X","url1x":"a","url2x":"b"}}}');
    const set = toBadgeSet(parsed);

    expect(set.get("toString")).toBeUndefined();
    expect(set.get("constructor")).toBeUndefined();
    for (const versions of set.values()) {
      expect(versions).toBeInstanceOf(Map);
    }
  });
});

describe("sliceSurrounding", () => {
  const entry = (id: number): SurroundingMessage => ({
    id,
    messageId: `m${id}`,
    userId: "u",
    userName: "user",
    displayName: null,
    color: null,
    content: `Nachricht ${id}`,
    receivedAt: "2026-07-29T10:00:00.000Z",
    deleted: false,
  });

  const full = {
    before: [entry(1), entry(2), entry(3), entry(4), entry(5)],
    after: [entry(7), entry(8), entry(9), entry(10), entry(11)],
  };

  it("liefert bei 0 nichts und meldet keine Grenze", () => {
    const result = sliceSurrounding(full, 0);

    expect(result.before).toEqual([]);
    expect(result.after).toEqual([]);
    expect(result.atStart).toBe(false);
    expect(result.atEnd).toBe(false);
  });

  it("nimmt die naechstgelegenen Nachrichten, nicht die aeltesten", () => {
    const result = sliceSurrounding(full, 2);

    expect(result.before.map((row) => row.id)).toEqual([4, 5]);
    expect(result.after.map((row) => row.id)).toEqual([7, 8]);
  });

  it("liefert alle vorhandenen, wenn weniger da sind als gewuenscht", () => {
    const kurz = { before: [entry(1), entry(2), entry(3)], after: [entry(7)] };
    const result = sliceSurrounding(kurz, 5);

    // Ohne Abfangen des negativen Index kaemen hier nur die letzten beiden.
    expect(result.before.map((row) => row.id)).toEqual([1, 2, 3]);
    expect(result.after.map((row) => row.id)).toEqual([7]);
  });

  it("meldet die Grenzen, wenn weniger vorliegen als gewuenscht", () => {
    const result = sliceSurrounding({ before: [entry(1)], after: [] }, 5);

    expect(result.atStart).toBe(true);
    expect(result.atEnd).toBe(true);
  });

  it("meldet keine Grenze, wenn genau so viele vorliegen wie gewuenscht", () => {
    const result = sliceSurrounding(full, 5);

    expect(result.atStart).toBe(false);
    expect(result.atEnd).toBe(false);
  });
});

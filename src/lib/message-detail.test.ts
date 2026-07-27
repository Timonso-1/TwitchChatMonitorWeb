import { describe, expect, it } from "vitest";
import { toBadgeSet } from "./message-detail";

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

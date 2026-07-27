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

  describe("Prototype-Ketten-Sicherheit (Finding 1)", () => {
    // JSON.parse erzeugt für "__proto__"/"constructor" ECHTE Eigenschaften auf
    // dem Objekt – ein per Objekt-Literal aufgebautes Label-Wörterbuch würde bei
    // naiver Indizierung (`dict[key]`) hier auf Object.prototype/Object stoßen
    // statt auf undefined, weil `??` nur bei null/undefined greift.
    const protoBeforeAfter = JSON.parse('{"before":{"__proto__":1},"after":{"__proto__":2}}');
    const protoConstructor = JSON.parse('{"constructor":1}');

    const malformedFixtures: unknown[] = [
      protoBeforeAfter,
      protoConstructor,
      { before: [1, 2, [3, 4]], after: [5, [6, [7, 8]]] },
      { a: { b: { c: { d: { e: "tief verschachtelt" } } } } },
      { before: 42, after: "text" },
      { before: true, after: false },
      { before: [], after: [] },
      { toString: "x", valueOf: "y", hasOwnProperty: "z", isPrototypeOf: "w" },
    ];

    it("wirft für keine der Malformed-Fixtures", () => {
      for (const fixture of malformedFixtures) {
        expect(() => normalizeAuditDetail(fixture)).not.toThrow();
      }
    });

    it("liefert für __proto__/constructor-Schlüssel ausschließlich String-Labels und -Werte", () => {
      const diffResult = normalizeAuditDetail(protoBeforeAfter);
      expect(diffResult.kind).toBe("diff");
      if (diffResult.kind === "diff") {
        expect(diffResult.fields.length).toBeGreaterThan(0);
        for (const field of diffResult.fields) {
          expect(typeof field.label).toBe("string");
        }
      }

      const propertiesResult = normalizeAuditDetail(protoConstructor);
      expect(propertiesResult.kind).toBe("properties");
      if (propertiesResult.kind === "properties") {
        expect(propertiesResult.entries.length).toBeGreaterThan(0);
        for (const entry of propertiesResult.entries) {
          expect(typeof entry.label).toBe("string");
          expect(typeof entry.value).toBe("string");
        }
      }
    });
  });

  it("stellt `before` ohne `after` als entfernte Berechtigungen dar (role.deleted)", () => {
    const result = normalizeAuditDetail({
      before: { permissions: ["roles.view", "audit.view"], priority: 40 },
    });

    expect(result.kind).toBe("diff");
    if (result.kind !== "diff") return;

    const field = result.fields.find((entry) => entry.key === "permissions");
    if (field?.type !== "list") throw new Error("Liste erwartet");

    expect(field.removed).toEqual(["roles.view", "audit.view"]);
    expect(field.added).toEqual([]);

    const priorityField = result.fields.find((entry) => entry.key === "priority");
    if (priorityField?.type !== "scalar") throw new Error("Skalar erwartet");
    expect(priorityField.before).toBe("40");
    expect(priorityField.after).toBeNull();
  });

  it("liefert `none`, wenn before und after identisch sind (dokumentiertes Verhalten)", () => {
    const result = normalizeAuditDetail({
      before: { permissions: ["roles.view"], priority: 40 },
      after: { permissions: ["roles.view"], priority: 40 },
    });

    expect(result.kind).toBe("none");
  });
});

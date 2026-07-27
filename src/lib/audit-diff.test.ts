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
});

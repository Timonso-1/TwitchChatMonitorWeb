import { describe, expect, it } from "vitest";
import { buildChannelFilterOptions, looksLikeUuid, resolveChannelFilter } from "./channel-filter";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";

describe("buildChannelFilterOptions", () => {
  it("liefert für keine Daten eine leere Liste", () => {
    expect(buildChannelFilterOptions([], new Map())).toEqual([]);
  });

  it("nimmt den Namen aus channels, nicht den aus der Datenzeile", () => {
    const options = buildChannelFilterOptions(
      [{ uuid: UUID_A, twitchId: "100", name: "alterName" }],
      new Map([[UUID_A, "neuerName"]]),
    );

    expect(options).toHaveLength(1);
    expect(options[0].name).toBe("neuerName");
    expect(options[0].label).toBe("neuerName");
    expect(options[0].orphaned).toBe(false);
  });

  it("kennzeichnet Channels ohne Eintrag in channels als gelöscht", () => {
    const options = buildChannelFilterOptions([{ uuid: UUID_A, twitchId: "100", name: "honeypuu" }], new Map());

    expect(options[0].orphaned).toBe(true);
    expect(options[0].name).toBe("honeypuu");
    expect(options[0].label).toBe("honeypuu (gelöscht)");
  });

  it("fasst mehrere UUIDs derselben Twitch-ID zu einer Option zusammen", () => {
    const options = buildChannelFilterOptions(
      [
        { uuid: UUID_A, twitchId: "100", name: "honeypuu" },
        { uuid: UUID_B, twitchId: "100", name: "honeypuu" },
      ],
      new Map([[UUID_B, "honeypuu"]]),
    );

    expect(options).toHaveLength(1);
    expect(options[0].uuids).toEqual([UUID_A, UUID_B]);
    // Eine der beiden UUIDs ist registriert, also gilt der Channel als vorhanden.
    expect(options[0].orphaned).toBe(false);
  });

  it("trennt verschiedene Twitch-IDs trotz gleichen Namens", () => {
    const options = buildChannelFilterOptions(
      [
        { uuid: UUID_A, twitchId: "100", name: "gleich" },
        { uuid: UUID_B, twitchId: "200", name: "gleich" },
      ],
      new Map(),
    );

    expect(options).toHaveLength(2);
    expect(options.map((option) => option.twitchId).sort()).toEqual(["100", "200"]);
  });

  it("nutzt bei Umbenennung den zuerst gelieferten, also jüngsten Namen", () => {
    const options = buildChannelFilterOptions(
      [
        { uuid: UUID_A, twitchId: "100", name: "neu" },
        { uuid: UUID_B, twitchId: "100", name: "alt" },
      ],
      new Map(),
    );

    expect(options[0].name).toBe("neu");
  });

  it("sortiert vorhandene Channels alphabetisch vor die gelöschten", () => {
    const options = buildChannelFilterOptions(
      [
        { uuid: UUID_A, twitchId: "100", name: "zeta" },
        { uuid: UUID_B, twitchId: "200", name: "alpha" },
        { uuid: UUID_C, twitchId: "300", name: "beta" },
      ],
      new Map([
        [UUID_A, "zeta"],
        [UUID_C, "beta"],
      ]),
    );

    expect(options.map((option) => option.name)).toEqual(["beta", "zeta", "alpha"]);
    expect(options.map((option) => option.orphaned)).toEqual([false, false, true]);
  });

  it("fällt auf die Twitch-ID zurück, wenn kein Name vorliegt", () => {
    const options = buildChannelFilterOptions([{ uuid: UUID_A, twitchId: "100", name: "" }], new Map());

    expect(options[0].name).toBe("100");
  });
});

describe("looksLikeUuid", () => {
  it("erkennt eine UUID", () => {
    expect(looksLikeUuid(UUID_A)).toBe(true);
  });

  it("weist eine Twitch-ID ab", () => {
    expect(looksLikeUuid("123456789")).toBe(false);
  });
});

describe("resolveChannelFilter", () => {
  const options = buildChannelFilterOptions(
    [
      { uuid: UUID_A, twitchId: "100", name: "honeypuu" },
      { uuid: UUID_B, twitchId: "100", name: "honeypuu" },
      { uuid: UUID_C, twitchId: "200", name: "anderer" },
    ],
    new Map([[UUID_C, "anderer"]]),
  );

  it("ohne Wert wird nicht gefiltert", () => {
    expect(resolveChannelFilter(options, undefined)).toEqual({ value: undefined, uuids: undefined });
  });

  it("löst eine Twitch-ID zu allen zugehörigen UUIDs auf", () => {
    expect(resolveChannelFilter(options, "100")).toEqual({ value: "100", uuids: [UUID_A, UUID_B] });
  });

  it("normalisiert einen alten Link mit bekannter UUID auf die Twitch-ID", () => {
    expect(resolveChannelFilter(options, UUID_A)).toEqual({ value: "100", uuids: [UUID_A, UUID_B] });
  });

  it("filtert einen alten Link mit unbekannter UUID unverändert weiter", () => {
    const unknown = "99999999-9999-4999-8999-999999999999";
    expect(resolveChannelFilter(options, unknown)).toEqual({ value: unknown, uuids: [unknown] });
  });

  it("ignoriert einen unbekannten Wert, statt eine leere Liste zu erzwingen", () => {
    expect(resolveChannelFilter(options, "999")).toEqual({ value: undefined, uuids: undefined });
  });
});

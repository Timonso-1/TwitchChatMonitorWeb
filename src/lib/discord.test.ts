import { describe, expect, it } from "vitest";
import { buildWatchlistAlertPayload, escapeDiscordMarkdown } from "./discord";

describe("escapeDiscordMarkdown", () => {
  it("laesst gewoehnlichen Text unveraendert", () => {
    expect(escapeDiscordMarkdown("Hallo Welt, wie geht es dir?")).toBe("Hallo Welt, wie geht es dir?");
  });

  it("maskiert Fettschrift und Kursiv", () => {
    expect(escapeDiscordMarkdown("**fett** und _kursiv_")).toBe("\\*\\*fett\\*\\* und \\_kursiv\\_");
  });

  it("maskiert Spoiler, damit der Text nicht verdeckt wird", () => {
    expect(escapeDiscordMarkdown("||versteckt||")).toBe("\\|\\|versteckt\\|\\|");
  });

  it("maskiert Codeblöcke, damit keine Zeilen verschluckt werden", () => {
    expect(escapeDiscordMarkdown("```js\ncode\n```")).toBe("\\`\\`\\`js\ncode\n\\`\\`\\`");
  });

  it("maskiert Durchstreichen", () => {
    expect(escapeDiscordMarkdown("~~weg~~")).toBe("\\~\\~weg\\~\\~");
  });

  it("maskiert den Backslash selbst nur einmal", () => {
    // Ohne den Backslash an erster Stelle der Zeichenklasse wuerde die Funktion
    // ihre eigenen Maskierungen erneut maskieren.
    expect(escapeDiscordMarkdown("a\\*b")).toBe("a\\\\\\*b");
  });

  it("laesst Zeilenumbrüche stehen", () => {
    expect(escapeDiscordMarkdown("Zeile 1\nZeile 2")).toBe("Zeile 1\nZeile 2");
  });
});

describe("buildWatchlistAlertPayload", () => {
  const hit = {
    channelId: "45044816",
    channelName: "montanablack88",
    userId: "12345",
    userName: "stoerer",
    displayName: "Störer",
    content: "besuch mal discord.gg/boese",
    receivedAt: new Date("2026-07-29T10:15:00.000Z"),
    avatarUrl: "https://cdn.example/avatar.png",
    terms: ["discord.gg"],
  };

  const embedOf = (payload: ReturnType<typeof buildWatchlistAlertPayload>) => payload.embeds[0];
  const fieldOf = (payload: ReturnType<typeof buildWatchlistAlertPayload>, name: string) =>
    embedOf(payload).fields.find((field) => field.name === name);

  it("unterdrueckt Erwaehnungen, damit @everyone aus dem Chat nicht pingt", () => {
    const payload = buildWatchlistAlertPayload({ ...hit, content: "@everyone kommt her" });

    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(fieldOf(payload, "Nachricht")?.value).toContain("@everyone");
  });

  it("stellt jede Angabe unter eine eigene Überschrift", () => {
    const names = embedOf(buildWatchlistAlertPayload(hit, "https://panel.example")).fields.map(
      (field) => field.name,
    );

    expect(names).toEqual([
      "Nachricht",
      "Begriff(e)",
      "Channel",
      "Zuschauer",
      "Profil",
      "Nachrichten im Channel",
    ]);
  });

  it("haelt mehrzeilige Nachrichten vollstaendig im Zitat", () => {
    const payload = buildWatchlistAlertPayload({ ...hit, content: "erste Zeile\nzweite Zeile" });

    // Ohne das Nachziehen des Praefixes stuende die zweite Zeile ausserhalb.
    expect(fieldOf(payload, "Nachricht")?.value).toBe("> erste Zeile\n> zweite Zeile");
  });

  it("nutzt den Zeitpunkt der Nachricht, nicht den des Versands", () => {
    expect(embedOf(buildWatchlistAlertPayload(hit)).timestamp).toBe("2026-07-29T10:15:00.000Z");
  });

  it("fuehrt Profil und Nachrichten als eigene Felder, wenn die Panel-Adresse bekannt ist", () => {
    const payload = buildWatchlistAlertPayload(hit, "https://panel.example/");

    // Der abschliessende Schraegstrich darf nicht doppelt auftauchen.
    expect(fieldOf(payload, "Profil")?.value).toBe("https://panel.example/viewers/12345");
    expect(fieldOf(payload, "Nachrichten im Channel")?.value).toContain("channel=45044816");
    expect(fieldOf(payload, "Nachrichten im Channel")?.value).toContain("user=stoerer");
  });

  it("laesst die Panel-Felder weg, wenn keine Adresse gesetzt ist", () => {
    const payload = buildWatchlistAlertPayload(hit);

    expect(fieldOf(payload, "Profil")).toBeUndefined();
    expect(fieldOf(payload, "Nachrichten im Channel")).toBeUndefined();
    // Der Twitch-Link braucht keine Konfiguration und bleibt.
    expect(fieldOf(payload, "Zuschauer")?.value).toBe("[Störer](https://twitch.tv/stoerer)");
  });

  it("verlinkt den Channel auf Twitch", () => {
    expect(fieldOf(buildWatchlistAlertPayload(hit), "Channel")?.value).toBe(
      "[montanablack88](https://twitch.tv/montanablack88)",
    );
  });

  it("maskiert Markdown im Chattext", () => {
    const payload = buildWatchlistAlertPayload({ ...hit, content: "||versteckt|| **laut**" });

    expect(fieldOf(payload, "Nachricht")?.value).toBe("> \\|\\|versteckt\\|\\| \\*\\*laut\\*\\*");
  });

  it("laesst das Avatarsymbol weg, wenn kein Bild vorliegt", () => {
    const embed = embedOf(buildWatchlistAlertPayload({ ...hit, avatarUrl: null }));

    expect("icon_url" in embed.author).toBe(false);
  });

  it("kuerzt lange Nachrichten", () => {
    const payload = buildWatchlistAlertPayload({ ...hit, content: "x".repeat(500) });

    // Discord kappt Feldwerte bei 1024 Zeichen – deutlich darunter bleiben.
    expect((fieldOf(payload, "Nachricht")?.value.length ?? 0)).toBeLessThan(320);
  });
});

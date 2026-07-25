/**
 * Themeverwaltung ueber ein Cookie, damit der Server die Wahl bereits
 * beim ersten Rendern kennt und nichts aufblitzt.
 */

export const THEME_COOKIE_NAME = "tp_theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type ThemePreference = "light" | "dark" | "system";

export const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "light", label: "Hell" },
  { value: "dark", label: "Dunkel" },
  { value: "system", label: "System" },
];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Wird als Inline-Skript vor dem ersten Paint ausgefuehrt.
 * Noetig fuer "System", weil der Server die Systemeinstellung nicht kennt.
 */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var root = document.documentElement;
    var pref = root.dataset.themePreference || "system";
    var dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
    root.classList.toggle("light", !dark);
  } catch (e) {}
})();
`.trim();

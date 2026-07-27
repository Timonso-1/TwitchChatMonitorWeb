"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { setThemeAction } from "@/lib/actions/theme";
import { THEME_OPTIONS, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";

const ICONS: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/**
 * Segmentierter Umschalter für das Theme.
 * Wendet die Klasse sofort im Browser an und speichert die Wahl
 * parallel per Server Action im Cookie.
 */
export function ThemeSwitch({
  value,
  className,
  /** Beschriftung neben dem Symbol anzeigen. */
  withLabels,
}: {
  value: ThemePreference;
  className?: string;
  withLabels?: boolean;
}) {
  const [current, setCurrent] = React.useState<ThemePreference>(value);

  function apply(preference: ThemePreference) {
    setCurrent(preference);

    const root = document.documentElement;
    root.dataset.themePreference = preference;

    const dark =
      preference === "dark" ||
      (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

    root.classList.toggle("dark", dark);
    root.classList.toggle("light", !dark);

    const formData = new FormData();
    formData.set("theme", preference);
    void setThemeAction(formData);
  }

  // Bei "System" auf Aenderungen der Betriebssystem-Einstellung reagieren.
  React.useEffect(() => {
    if (current !== "system") return;

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", event.matches);
      document.documentElement.classList.toggle("light", !event.matches);
    };

    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [current]);

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-0.5",
        className,
      )}
      role="group"
      aria-label="Erscheinungsbild"
    >
      {THEME_OPTIONS.map((option) => {
        const Icon = ICONS[option.value];
        const active = current === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => apply(option.value)}
            aria-pressed={active}
            title={option.label}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-[5px] py-1.5 text-xs transition-colors",
              active
                ? "bg-[var(--color-accent)] font-medium text-[var(--color-foreground)]"
                : "text-[var(--color-subtle)] hover:text-[var(--color-foreground)]",
            )}
          >
            <Icon className="size-3.5" />
            {withLabels ? option.label : <span className="sr-only">{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

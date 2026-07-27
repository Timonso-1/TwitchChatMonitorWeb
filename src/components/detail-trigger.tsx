"use client";

import type { ReactNode } from "react";

/**
 * Macht den Inhalt einer Tabellenzelle anklickbar, ohne ihn zu umschliessen.
 *
 * Die Schaltfläche liegt bewusst als Fläche darüber: Absätze und Listen
 * dürfen laut HTML nicht in einer <button> stehen, und ein Umschalter im
 * Inhalt wäre darin ein Knopf im Knopf – per Tastatur unerreichbar.
 *
 * Preis dieser Lösung: der Text darunter lässt sich nicht mehr mit der Maus
 * markieren. Im Dialog geht es.
 */
export function DetailTrigger({
  label,
  onOpen,
  children,
}: {
  /** Was die Schaltfläche für Screenreader ankündigt. */
  label: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      {children}

      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 cursor-pointer rounded-sm transition-colors hover:bg-[color-mix(in_srgb,var(--color-foreground)_5%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      >
        <span className="sr-only">{label}</span>
      </button>
    </div>
  );
}

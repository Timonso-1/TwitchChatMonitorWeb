"use client";

import type { ReactNode } from "react";
import { Maximize2 } from "lucide-react";

/**
 * Sichtbare Schaltfläche am Zeilenende.
 *
 * Für Zeilen ohne verlässlich gefüllte Textspalte – dort wäre eine
 * überlagerte Fläche unsichtbar und damit unauffindbar.
 */
export function DetailButton({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title={label}
      className="inline-flex size-7 items-center justify-center rounded-md text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
    >
      <Maximize2 className="size-3.5" />
      <span className="sr-only">{label}</span>
    </button>
  );
}

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

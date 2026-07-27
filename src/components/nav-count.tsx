"use client";

import { use } from "react";
import { Badge } from "@/components/ui/badge";
import type { NavCountKey, NavCounts } from "@/lib/navigation";
import { cn, formatNavCount, formatNumber } from "@/lib/utils";

interface NavCountProps {
  /** Wird bewusst als Promise gereicht und hier aufgelöst, damit die
   *  Navigation sofort rendert und nicht auf den teuren COUNT(*) wartet. */
  promise: Promise<NavCounts>;
  countKey: NavCountKey;
  active: boolean;
}

export function NavCount({ promise, countKey, active }: NavCountProps) {
  const value = use(promise)[countKey];

  // Fehlt der Wert, ist die Abfrage fehlgeschlagen – dann lieber nichts zeigen
  // als eine falsche Null. Eine echte Null wird ebenfalls ausgeblendet: Ein
  // Chip mit "0" trägt keine Information, die der leere Eintrag nicht schon
  // selbst vermittelt.
  if (!value) return null;

  return (
    <Badge
      variant="secondary"
      title={formatNumber(value)}
      className={cn(
        "shrink-0 px-1.5 py-0 text-[0.7rem] font-semibold tabular-nums leading-[1.15rem]",
        // --color-secondary und --color-accent sind identisch: Auf der aktiven
        // Zeile wäre ein Standard-Chip unsichtbar. Dort wird er stattdessen
        // aus dem Accent-Hintergrund ausgestanzt.
        active
          ? "bg-[var(--color-background)] text-[var(--color-foreground)]"
          : "text-[var(--color-muted-foreground)]",
      )}
    >
      {formatNavCount(value)}
    </Badge>
  );
}

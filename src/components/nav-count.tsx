"use client";

import { use } from "react";
import { Badge } from "@/components/ui/badge";
import { cn, formatNavCount, formatNumber } from "@/lib/utils";

interface NavCountProps {
  /**
   * Das Promise genau dieses Zählers – nicht eines für alle.
   *
   * Dadurch wartet die Suspense-Grenze um dieses Badge nur auf die eigene
   * Abfrage. Ein gemeinsames Promise würde jede Zahl an den langsamsten Zähler
   * koppeln und die Grenzen wirkungslos machen.
   */
  promise?: Promise<number | undefined>;
  active: boolean;
}

export function NavCount({ promise, active }: NavCountProps) {
  const value = promise ? use(promise) : undefined;

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

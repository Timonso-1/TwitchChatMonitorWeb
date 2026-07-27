"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClampedContentProps {
  children: ReactNode;
  className?: string;
  /** Anzahl Zeilen, nach denen abgeschnitten wird. */
  lines?: 2 | 3 | 4;
}

const CLAMP_CLASS: Record<number, string> = {
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
};

/**
 * Schneidet sehr lange Nachrichten nach ein paar Zeilen ab, mit einem
 * „Mehr anzeigen“-Umschalter. Ob überhaupt abgeschnitten wurde, wird per
 * Höhenvergleich erkannt statt per Zeichenanzahl – so passt es sich an
 * Emotes, Umbrüche und unterschiedliche Bildschirmbreiten an.
 */
export function ClampedContent({ children, className, lines = 3 }: ClampedContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
    // Nur beim Einhängen mit aktivem Clamp gemessen – reicht, um zu wissen, ob Inhalt abgeschnitten wird.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

  return (
    <div>
      <div ref={ref} className={cn(!expanded && CLAMP_CLASS[lines], className)}>
        {children}
      </div>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-0.5 flex items-center gap-0.5 text-xs font-medium text-[var(--color-brand)] hover:underline"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3" />
              Weniger anzeigen
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              Mehr anzeigen
            </>
          )}
        </button>
      )}
    </div>
  );
}

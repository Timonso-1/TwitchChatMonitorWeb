import Link from "next/link";
import type { ReactNode } from "react";
import { cn, formatNumber } from "@/lib/utils";

export interface RankingEntry {
  id: string;
  label: string;
  /** Zweite Zeile unter dem Namen, z. B. der Benutzername. */
  sublabel?: string;
  value: number;
  href?: string;
  /** Eigenes Element links, z. B. ein Avatar. */
  leading?: ReactNode;
  /** Kleines Abzeichen rechts neben dem Namen. */
  badge?: ReactNode;
}

interface RankingListProps {
  entries: RankingEntry[];
  /** Einheit hinter dem Wert, z. B. "Nachrichten". */
  unit?: string;
  emptyMessage?: string;
  /** Farbe des Fortschrittsbalkens. */
  accent?: "brand" | "success" | "info" | "warning" | "neutral";
  /** Rangnummer statt Aufzählungspunkt anzeigen. */
  showRank?: boolean;
}

const ACCENT_BAR: Record<NonNullable<RankingListProps["accent"]>, string> = {
  brand: "bg-[var(--color-brand)]",
  success: "bg-[var(--color-success)]",
  info: "bg-[var(--color-info)]",
  warning: "bg-[var(--color-warning)]",
  neutral: "bg-[var(--color-muted-foreground)]",
};

/**
 * Rangliste mit Anteilsbalken.
 *
 * Bewusst kein Balkendiagramm: bei einer Handvoll Eintraegen mit langen
 * Namen ist eine Liste lesbarer, und der Name wird nicht abgeschnitten.
 */
export function RankingList({
  entries,
  unit,
  emptyMessage,
  accent = "brand",
  showRank = true,
}: RankingListProps) {
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
        {emptyMessage ?? "Keine Daten im gewählten Zeitraum."}
      </p>
    );
  }

  const max = Math.max(...entries.map((entry) => entry.value), 1);

  return (
    <ol className="space-y-2.5">
      {entries.map((entry, index) => {
        const share = Math.max(2, Math.round((entry.value / max) * 100));

        const content = (
          <>
            <div className="flex items-center gap-2.5">
              {showRank && (
                <span className="w-4 shrink-0 text-xs tabular-nums text-[var(--color-subtle)]">{index + 1}</span>
              )}

              {entry.leading}

              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-sm font-medium">{entry.label}</span>
                {entry.badge}
              </div>

              <span className="shrink-0 text-sm tabular-nums">
                {formatNumber(entry.value)}
                {unit && <span className="ml-1 text-xs text-[var(--color-subtle)]">{unit}</span>}
              </span>
            </div>

            {entry.sublabel && (
              <p
                className={cn(
                  "truncate text-xs text-[var(--color-muted-foreground)]",
                  showRank ? "pl-6.5" : "pl-0",
                )}
              >
                {entry.sublabel}
              </p>
            )}

            {/* Anteilsbalken relativ zum groessten Wert der Liste */}
            <div className="h-1 overflow-hidden rounded-full bg-[var(--color-muted)]">
              <div
                className={cn("h-full rounded-full transition-all", ACCENT_BAR[accent])}
                style={{ width: `${share}%` }}
              />
            </div>
          </>
        );

        return (
          <li key={entry.id} className="space-y-1.5">
            {entry.href ? (
              <Link
                href={entry.href}
                className="block space-y-1.5 rounded-md py-0.5 transition-colors hover:bg-[var(--color-surface)]"
              >
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}

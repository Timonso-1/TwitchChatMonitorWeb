import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildQueryString, cn, formatNumber } from "@/lib/utils";

interface PaginationProps {
  /** Basispfad ohne Query, z. B. "/messages". */
  basePath: string;
  /** Aktuelle Query-Parameter, die erhalten bleiben sollen. */
  params: Record<string, string | number | undefined | null>;
  page: number;
  pageSize: number;
  total: number;
  /** Name des Seiten-Parameters – nötig, wenn mehrere Listen auf einer Seite blättern. */
  pageParam?: string;
  /** Bezeichnung der Einträge, z. B. "Nachrichten". */
  itemLabel?: string;
}

const BUTTON_BASE =
  "inline-flex h-8 items-center justify-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors";

/** Erzeugt die Seitenliste mit Auslassungen: 1 … 4 5 6 … 20 */
function pageWindow(current: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, current]);

  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < totalPages) pages.add(current + 1);

  // Am Rand etwas mehr Kontext zeigen.
  if (current <= 3) [2, 3, 4].forEach((page) => page < totalPages && pages.add(page));
  if (current >= totalPages - 2) {
    [totalPages - 3, totalPages - 2, totalPages - 1].forEach((page) => page > 1 && pages.add(page));
  }

  const sorted = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const result: Array<number | "gap"> = [];

  for (let index = 0; index < sorted.length; index++) {
    if (index > 0 && sorted[index] - sorted[index - 1] > 1) result.push("gap");
    result.push(sorted[index]);
  }

  return result;
}

export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
  pageParam = "page",
  itemLabel,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const hrefFor = (targetPage: number) =>
    `${basePath}${buildQueryString({ ...params, [pageParam]: targetPage === 1 ? undefined : targetPage })}`;

  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  // Bei nur einer Seite reicht die Zusammenfassung.
  if (totalPages <= 1) {
    return (
      <div className="border-t border-[var(--color-border)] px-4 py-2.5">
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {total === 0
            ? "Keine Ergebnisse"
            : `${formatNumber(total)} ${itemLabel ?? "Einträge"}`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--color-border)] px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-[var(--color-muted-foreground)]">
        <span className="tabular-nums">
          {formatNumber(from)}–{formatNumber(to)}
        </span>{" "}
        von <span className="tabular-nums">{formatNumber(total)}</span> {itemLabel ?? "Einträgen"}
      </p>

      <nav className="flex items-center gap-1" aria-label="Seitennavigation">
        {hasPrevious ? (
          <Link
            href={hrefFor(page - 1)}
            rel="prev"
            className={cn(
              BUTTON_BASE,
              "border-[var(--color-border-strong)] text-[var(--color-foreground)] hover:bg-[var(--color-accent)]",
            )}
          >
            <ChevronLeft className="size-3.5" />
            Zurück
          </Link>
        ) : (
          <span
            aria-disabled
            className={cn(BUTTON_BASE, "border-[var(--color-border)] text-[var(--color-subtle)] opacity-50")}
          >
            <ChevronLeft className="size-3.5" />
            Zurück
          </span>
        )}

        <span className="mx-1 hidden items-center gap-1 sm:flex">
          {pageWindow(page, totalPages).map((entry, index) =>
            entry === "gap" ? (
              <span key={`gap-${index}`} className="px-1 text-xs text-[var(--color-subtle)]">
                …
              </span>
            ) : (
              <Link
                key={entry}
                href={hrefFor(entry)}
                aria-current={entry === page ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs tabular-nums transition-colors",
                  entry === page
                    ? "bg-[var(--color-accent)] font-medium text-[var(--color-foreground)]"
                    : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-surface)] hover:text-[var(--color-foreground)]",
                )}
              >
                {entry}
              </Link>
            ),
          )}
        </span>

        <span className="mx-1 text-xs tabular-nums text-[var(--color-muted-foreground)] sm:hidden">
          {formatNumber(page)} / {formatNumber(totalPages)}
        </span>

        {hasNext ? (
          <Link
            href={hrefFor(page + 1)}
            rel="next"
            className={cn(
              BUTTON_BASE,
              "border-[var(--color-border-strong)] text-[var(--color-foreground)] hover:bg-[var(--color-accent)]",
            )}
          >
            Weiter
            <ChevronRight className="size-3.5" />
          </Link>
        ) : (
          <span
            aria-disabled
            className={cn(BUTTON_BASE, "border-[var(--color-border)] text-[var(--color-subtle)] opacity-50")}
          >
            Weiter
            <ChevronRight className="size-3.5" />
          </span>
        )}
      </nav>
    </div>
  );
}

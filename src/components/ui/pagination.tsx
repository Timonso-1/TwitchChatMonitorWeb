import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
import { buildQueryString, formatNumber } from "@/lib/utils";

interface PaginationProps {
  /** Basispfad ohne Query, z. B. "/messages". */
  basePath: string;
  /** Aktuelle Query-Parameter, die erhalten bleiben sollen. */
  params: Record<string, string | number | undefined | null>;
  page: number;
  pageSize: number;
  total: number;
}

export function Pagination({ basePath, params, page, pageSize, total }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const hrefFor = (targetPage: number) => `${basePath}${buildQueryString({ ...params, page: targetPage })}`;

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--color-border)] px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-[var(--color-muted-foreground)]">
        {total === 0
          ? "Keine Ergebnisse"
          : `${formatNumber(from)}–${formatNumber(to)} von ${formatNumber(total)} · Seite ${formatNumber(page)}/${formatNumber(totalPages)}`}
      </p>

      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" asChild={page > 1} disabled={page <= 1}>
          {page > 1 ? (
            <Link href={hrefFor(page - 1)}>
              <ChevronLeft />
              Zurück
            </Link>
          ) : (
            <span>
              <ChevronLeft />
              Zurück
            </span>
          )}
        </Button>

        <Button variant="outline" size="sm" asChild={page < totalPages} disabled={page >= totalPages}>
          {page < totalPages ? (
            <Link href={hrefFor(page + 1)}>
              Weiter
              <ChevronRight />
            </Link>
          ) : (
            <span>
              Weiter
              <ChevronRight />
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

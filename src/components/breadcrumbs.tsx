import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
}

/** Pfadanzeige im Kopfbereich, wie in der Referenz: Core › Spieler › … */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Pfad" className="flex min-w-0 items-center gap-1 text-sm">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <span key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
            {index > 0 && <ChevronRight className="size-3.5 shrink-0 text-[var(--color-subtle)]" aria-hidden />}

            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="truncate text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className={
                  isLast ? "truncate font-medium text-[var(--color-foreground)]" : "truncate text-[var(--color-muted-foreground)]"
                }
                aria-current={isLast ? "page" : undefined}
              >
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

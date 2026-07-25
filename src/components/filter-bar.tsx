import Link from "next/link";
import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FilterBarProps {
  /** Ziel des GET-Formulars, z. B. "/messages". */
  action: string;
  children: ReactNode;
  /** Zeigt einen Zurücksetzen-Link, wenn Filter aktiv sind. */
  hasActiveFilters?: boolean;
}

/**
 * Filterleiste als natives GET-Formular. Dadurch landen alle Filter
 * in der URL und die Seite bleibt teilbar und cachebar.
 */
export function FilterBar({ action, children, hasActiveFilters }: FilterBarProps) {
  return (
    <form
      action={action}
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3.5 ring-inset-subtle"
    >
      {children}

      <div className="flex items-center gap-1.5">
        <Button type="submit" size="sm">
          <Search />
          Filtern
        </Button>
        {hasActiveFilters && (
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href={action}>
              <X />
              Zurücksetzen
            </Link>
          </Button>
        )}
      </div>
    </form>
  );
}

export function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className ?? "w-full space-y-1.5 sm:w-52"}>
      <span className="block text-xs font-medium text-[var(--color-muted-foreground)]">{label}</span>
      {children}
    </div>
  );
}

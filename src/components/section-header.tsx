import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  description?: string;
  /** Rechts neben dem Titel, z. B. „Alle anzeigen“. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Einheitlicher Abschnittskopf für Panel-Seiten:
 * Titel + kurze Beschreibung, optional Aktion rechts.
 */
export function SectionHeader({ title, description, actions, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0 space-y-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-[var(--color-muted-foreground)]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

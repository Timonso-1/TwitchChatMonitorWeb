import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  className?: string;
  /** Kompakter für Tabellenzeilen / kleine Karten. */
  compact?: boolean;
}

/**
 * Ruhiger Leerzustand – Titel + optionale Hilfe, ohne laute Illustration.
 */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  className,
  compact,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-1.5 px-4 py-10" : "gap-2 px-6 py-14",
        className,
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-xl bg-[var(--color-secondary)] text-[var(--color-muted-foreground)]",
          compact ? "size-10" : "size-12",
        )}
      >
        <Icon className={compact ? "size-4" : "size-5"} />
      </span>
      <p className={cn("font-medium tracking-tight text-[var(--color-foreground)]", compact ? "text-sm" : "text-sm")}>
        {title}
      </p>
      {description && (
        <p className="max-w-sm text-xs leading-relaxed text-[var(--color-muted-foreground)]">{description}</p>
      )}
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Zeigt einen Zurück-Pfeil links neben dem Titel. */
  backHref?: string;
  className?: string;
}

export function PageHeader({ title, description, actions, backHref, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b border-[var(--color-border)] pb-5 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {backHref && (
          <Button variant="ghost" size="icon" asChild className="mt-0.5 shrink-0">
            <Link href={backHref} aria-label="Zurück">
              <ArrowLeft />
            </Link>
          </Button>
        )}

        <div className="min-w-0 space-y-1.5">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--color-muted-foreground)]">{description}</p>
          )}
        </div>
      </div>

      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

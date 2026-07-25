import type { ReactNode } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  /** Rechts im Kopf, typischerweise die Zeitraumwahl. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Einheitlicher Rahmen fuer Diagramme: Titel und Beschreibung links,
 * Zeitraumwahl rechts, darunter das Diagramm.
 */
export function ChartCard({ title, description, actions, children, className }: ChartCardProps) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex-row items-start justify-between gap-3 border-b border-[var(--color-border)]">
        <div className="min-w-0 space-y-1">
          <h2 className="truncate text-sm font-semibold leading-none tracking-tight">{title}</h2>
          {description && <p className="text-xs text-[var(--color-muted-foreground)]">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </CardHeader>

      <CardContent className="flex-1 pt-4">{children}</CardContent>
    </Card>
  );
}

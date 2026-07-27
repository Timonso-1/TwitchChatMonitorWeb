import type { ReactNode } from "react";
import { PanelSurface } from "@/components/panel-surface";
import { SectionHeader } from "@/components/section-header";
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
 * Abschnittslayout für Diagramme: SectionHeader oben, PanelSurface darunter.
 */
export function ChartCard({ title, description, actions, children, className }: ChartCardProps) {
  return (
    <section className={cn("space-y-4", className)}>
      <SectionHeader title={title} description={description} actions={actions} />
      <PanelSurface>{children}</PanelSurface>
    </section>
  );
}

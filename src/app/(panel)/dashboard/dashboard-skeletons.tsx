import { PanelSurface } from "@/components/panel-surface";

/** Platzhalter für Lead (Chart + StatCards), während die Abfragen laufen. */
export function DashboardLeadSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-4">
        <div className="h-5 w-40 animate-pulse rounded bg-[var(--color-muted)]" />
        <PanelSurface>
          <div className="h-[320px] animate-pulse rounded-lg bg-[var(--color-muted)]" />
        </PanelSurface>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-[88px] animate-pulse rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]" />
        ))}
      </div>
    </div>
  );
}

/** Platzhalter für Rankings und Tabellen. */
export function DashboardSectionsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid gap-8 xl:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl bg-[var(--color-muted)]" />
        <div className="h-64 animate-pulse rounded-xl bg-[var(--color-muted)]" />
      </div>
      <div className="h-48 animate-pulse rounded-xl bg-[var(--color-muted)]" />
      <div className="grid gap-8 xl:grid-cols-2">
        <div className="h-56 animate-pulse rounded-xl bg-[var(--color-muted)]" />
        <div className="h-56 animate-pulse rounded-xl bg-[var(--color-muted)]" />
      </div>
    </div>
  );
}

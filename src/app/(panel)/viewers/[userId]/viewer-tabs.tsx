import Link from "next/link";
import { BarChart3, MessageSquare, ShieldAlert, StickyNote, Zap, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buildQueryString, cn, formatNumber } from "@/lib/utils";

export type ViewerTabKey = "overview" | "messages" | "events" | "moderation" | "notes";

export const VIEWER_TABS: Array<{ key: ViewerTabKey; label: string; icon: LucideIcon }> = [
  { key: "overview", label: "Überblick", icon: BarChart3 },
  { key: "messages", label: "Nachrichten", icon: MessageSquare },
  { key: "events", label: "Events", icon: Zap },
  { key: "moderation", label: "Moderation", icon: ShieldAlert },
  { key: "notes", label: "Notizen", icon: StickyNote },
];

export function normalizeViewerTab(value: unknown): ViewerTabKey {
  const raw = Array.isArray(value) ? value[0] : value;
  const match = VIEWER_TABS.find((tab) => tab.key === raw);
  return match?.key ?? "overview";
}

interface ViewerTabsNavProps {
  /** Basispfad des Profils, z. B. "/viewers/12345". */
  basePath: string;
  active: ViewerTabKey;
  /** Sichtbare Reiter – abhaengig von den Rechten. */
  available: ViewerTabKey[];
  counts: Partial<Record<ViewerTabKey, number>>;
}

/**
 * Reiter als Links statt als Client-State.
 * Dadurch bleibt der aktive Reiter beim Blaettern erhalten und die
 * Seite laesst sich direkt auf einen Reiter verlinken.
 */
export function ViewerTabsNav({ basePath, active, available, counts }: ViewerTabsNavProps) {
  const tabs = VIEWER_TABS.filter((tab) => available.includes(tab.key));

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-thin rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active;
        const count = counts[tab.key];

        return (
          <Link
            key={tab.key}
            href={`${basePath}${buildQueryString({ tab: tab.key === "overview" ? undefined : tab.key })}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-3 py-1.5 text-sm transition-colors",
              isActive
                ? "bg-[var(--color-accent)] font-medium text-[var(--color-foreground)]"
                : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            {tab.label}
            {count !== undefined && count > 0 && (
              <Badge variant="muted" className="ml-0.5 px-1 py-0 text-[0.65rem]">
                {formatNumber(count)}
              </Badge>
            )}
          </Link>
        );
      })}
    </div>
  );
}

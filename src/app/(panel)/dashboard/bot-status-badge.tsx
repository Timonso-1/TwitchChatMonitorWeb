import { getBotStatus } from "@/lib/queries/bot-status";
import { cn, formatRelative } from "@/lib/utils";

export async function BotStatusBadge() {
  const status = await getBotStatus();
  const lastActivity = status.lastMessageAt ?? status.lastHeartbeatAt;

  return (
    <span
      className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2.5 py-1.5 text-xs text-[var(--color-muted-foreground)]"
      title={lastActivity ? `Zuletzt aktiv ${formatRelative(lastActivity)}` : "Noch keine Aktivität aufgezeichnet"}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          status.online ? "animate-pulse bg-[var(--color-success)]" : "bg-[var(--color-destructive)]",
        )}
      />
      Bot {status.online ? "online" : "offline"}
    </span>
  );
}

export function BotStatusBadgeSkeleton() {
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2.5 py-1.5 text-xs text-[var(--color-subtle)]">
      <span className="size-2 rounded-full bg-[var(--color-muted)]" />
      Bot …
    </span>
  );
}

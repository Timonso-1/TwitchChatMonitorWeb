import { Bot, Laptop, Monitor, Smartphone, Tablet } from "lucide-react";
import { parseUserAgent, type DeviceKind } from "@/lib/user-agent";

const DEVICE_ICONS: Record<DeviceKind, typeof Monitor> = {
  desktop: Laptop,
  mobile: Smartphone,
  tablet: Tablet,
  bot: Bot,
  unknown: Monitor,
};

/**
 * Zeigt eine Sitzung als Geraet statt als Roh-String.
 * Der vollstaendige User-Agent bleibt im Tooltip erhalten.
 */
export function SessionDevice({ userAgent }: { userAgent: string | null }) {
  const parsed = parseUserAgent(userAgent);
  const Icon = DEVICE_ICONS[parsed.device];

  return (
    <span className="flex items-center gap-2" title={userAgent ?? undefined}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
        <Icon className="size-3.5" />
      </span>

      <span className="min-w-0">
        <span className="block truncate text-sm">{parsed.label}</span>
        {parsed.device === "bot" && (
          <span className="block text-xs text-[var(--color-warning)]">Automatisierter Zugriff</span>
        )}
      </span>
    </span>
  );
}

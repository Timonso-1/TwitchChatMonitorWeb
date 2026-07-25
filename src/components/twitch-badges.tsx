import { Badge, type BadgeProps } from "@/components/ui/badge";
import { SUB_TIER_COLORS, eventTypeLabel, moderationActionLabel, normalizeSubTier, subTierLabel } from "@/lib/twitch";

const EVENT_VARIANTS: Record<string, BadgeProps["variant"]> = {
  sub: "primary",
  subscribe: "primary",
  subscription: "primary",
  resub: "primary",
  subgift: "primary",
  submysterygift: "primary",
  giftpaidupgrade: "primary",
  anongiftpaidupgrade: "primary",
  primepaidupgrade: "primary",
  raid: "warning",
  host: "warning",
  cheer: "success",
  bits: "success",
  follow: "secondary",
  hypetrain: "warning",
  streamup: "success",
  streamdown: "muted",
};

export function EventBadge({ type }: { type: string }) {
  return <Badge variant={EVENT_VARIANTS[type.toLowerCase()] ?? "outline"}>{eventTypeLabel(type)}</Badge>;
}

const MODERATION_VARIANTS: Record<string, BadgeProps["variant"]> = {
  ban: "destructive",
  timeout: "warning",
  delete: "warning",
  warn: "warning",
  clear: "muted",
  unban: "success",
  untimeout: "success",
};

export function ModerationBadge({ action }: { action: string }) {
  return <Badge variant={MODERATION_VARIANTS[action.toLowerCase()] ?? "outline"}>{moderationActionLabel(action)}</Badge>;
}

/** Zeigt die Abo-Stufe in der jeweiligen Twitch-Farbe. Ohne Stufe wird nichts gerendert. */
export function SubTierBadge({ tier }: { tier: string | null | undefined }) {
  const normalized = normalizeSubTier(tier);
  if (normalized === "unknown") return null;

  const color = SUB_TIER_COLORS[normalized];

  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {subTierLabel(tier)}
    </span>
  );
}

/** Rollen-Abzeichen einer Chatnachricht (Broadcaster, Mod, VIP, Sub …). */
export function ChatRoleBadges({
  isBroadcaster,
  isMod,
  isVip,
  isSubscriber,
  isFirstMessage,
}: {
  isBroadcaster?: boolean;
  isMod?: boolean;
  isVip?: boolean;
  isSubscriber?: boolean;
  isFirstMessage?: boolean;
}) {
  return (
    <>
      {isBroadcaster && <Badge variant="destructive">Broadcaster</Badge>}
      {isMod && <Badge variant="success">Mod</Badge>}
      {isVip && <Badge variant="primary">VIP</Badge>}
      {isSubscriber && <Badge variant="secondary">Sub</Badge>}
      {isFirstMessage && <Badge variant="warning">Erste Nachricht</Badge>}
    </>
  );
}

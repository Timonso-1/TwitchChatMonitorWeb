import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { BadgeSet } from "@/lib/twitch-api";
import { parseBadges } from "@/lib/twitch-tags";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Abzeichen einer Chatnachricht – so wie sie im Twitch-Chat aussehen.
 *
 * Drei Stufen, absteigend nach Genauigkeit:
 *  1. Bilder aus dem Abzeichensatz des Channels (falls Zugangsdaten hinterlegt)
 *  2. beschriftete Abzeichen aus dem rohen `badges`-Tag
 *  3. die vier Boolean-Spalten – der Stand älterer Datensätze ohne Tag
 */

const FALLBACK_VARIANTS: Record<string, BadgeProps["variant"]> = {
  broadcaster: "destructive",
  moderator: "success",
  vip: "primary",
  subscriber: "secondary",
  founder: "primary",
  premium: "info",
  turbo: "info",
  staff: "warning",
  admin: "warning",
  partner: "primary",
  artist: "secondary",
};

/** Kurzform für die enge Nutzerspalte der Tabellen. */
const SHORT_LABELS: Record<string, string> = {
  broadcaster: "Host",
  moderator: "Mod",
  subscriber: "Sub",
  founder: "Gründer",
  premium: "Prime",
};

interface ChatBadgesProps {
  /** Roher `badges`-Tag, z. B. "moderator/1,subscriber/12". */
  badges?: string | null;
  badgeInfo?: string | null;
  /** Abzeichensatz des Channels aus getCachedBadgeSets(). */
  set?: BadgeSet;
  /** Rückfall für Datensätze ohne rohen Tag. */
  isBroadcaster?: boolean;
  isMod?: boolean;
  isVip?: boolean;
  isSubscriber?: boolean;
  className?: string;
}

export function ChatBadges({
  badges,
  badgeInfo,
  set,
  isBroadcaster,
  isMod,
  isVip,
  isSubscriber,
  className,
}: ChatBadgesProps) {
  const parsed = parseBadges(badges, badgeInfo);

  if (parsed.length === 0) {
    return (
      <FlagBadges
        isBroadcaster={isBroadcaster}
        isMod={isMod}
        isVip={isVip}
        isSubscriber={isSubscriber}
        className={className}
      />
    );
  }

  return (
    <span className={cn("inline-flex shrink-0 flex-wrap items-center gap-0.5", className)}>
      {parsed.map((badge) => {
        const image = set?.get(badge.name)?.get(badge.version);

        // Die Monatszahl aus badge_info ist genauer als die Abzeichenstufe.
        const title =
          badge.months !== null
            ? `${image?.title ?? badge.label} · ${formatNumber(badge.months)} Monate`
            : (image?.title ?? badge.label);

        if (image) {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${badge.name}/${badge.version}`}
              src={image.url1x}
              srcSet={`${image.url1x} 1x, ${image.url2x} 2x`}
              alt={title}
              title={title}
              width={18}
              height={18}
              loading="lazy"
              className="size-[18px] shrink-0 rounded-[3px] object-contain"
            />
          );
        }

        return (
          <Badge
            key={`${badge.name}/${badge.version}`}
            variant={FALLBACK_VARIANTS[badge.name] ?? "outline"}
            title={title}
          >
            {SHORT_LABELS[badge.name] ?? badge.label}
            {badge.months !== null && ` ${formatNumber(badge.months)}`}
          </Badge>
        );
      })}
    </span>
  );
}

/** Abzeichen aus den Boolean-Spalten – für Datensätze ohne rohen Tag. */
function FlagBadges({
  isBroadcaster,
  isMod,
  isVip,
  isSubscriber,
  className,
}: Pick<ChatBadgesProps, "isBroadcaster" | "isMod" | "isVip" | "isSubscriber" | "className">) {
  if (!isBroadcaster && !isMod && !isVip && !isSubscriber) return null;

  return (
    <span className={cn("inline-flex shrink-0 flex-wrap items-center gap-0.5", className)}>
      {isBroadcaster && <Badge variant="destructive">Host</Badge>}
      {isMod && <Badge variant="success">Mod</Badge>}
      {isVip && <Badge variant="primary">VIP</Badge>}
      {isSubscriber && <Badge variant="secondary">Sub</Badge>}
    </span>
  );
}

import { CornerDownRight, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ClampedContent } from "@/components/clamped-content";
import { HighlightedMessage } from "@/components/highlighted-message";
import { emoteImageUrl, parseEmotes, subscriberMonths } from "@/lib/twitch-tags";
import { cn, formatNumber, truncate } from "@/lib/utils";
import type { TermMatch } from "@/lib/watchlist";

interface MessageContentProps {
  content: string;
  /** Roher Twitch-Tag mit den Emote-Positionen. */
  emotes?: string | null;
  badgeInfo?: string | null;
  isAction?: boolean;
  bits?: number;
  isFirstMessage?: boolean;
  /** Wurde die Nachricht von einem Moderator entfernt? */
  isDeleted?: boolean;
  /** Ursprungsnachricht, falls dies eine Antwort ist. */
  replyTo?: { userName: string; content: string } | null;
  /** Treffer des Wortfilters. */
  matches?: TermMatch[];
  /** Emote-Bilder statt Text anzeigen. */
  showEmoteImages?: boolean;
  /** „Mehr anzeigen“ anbieten. Aus, wenn der Inhalt in einer Schaltfläche steckt. */
  expandable?: boolean;
}

/**
 * Einheitliche Darstellung einer Chatnachricht mit allen Zusatzinformationen:
 * Antwortbezug, Löschung, Emotes, Bits und Wortfilter-Treffer.
 */
export function MessageContent({
  content,
  emotes,
  badgeInfo,
  isAction,
  bits = 0,
  isFirstMessage,
  isDeleted,
  replyTo,
  matches = [],
  showEmoteImages,
  expandable = true,
}: MessageContentProps) {
  const parsedEmotes = showEmoteImages ? parseEmotes(emotes, content) : [];
  const months = subscriberMonths(badgeInfo);

  return (
    <div className="min-w-0 space-y-1">
      {/* Bezug auf die beantwortete Nachricht */}
      {replyTo && (
        <p className="flex items-start gap-1 truncate text-xs text-[var(--color-subtle)]">
          <CornerDownRight className="mt-0.5 size-3 shrink-0" />
          <span className="truncate">
            Antwort auf <span className="font-medium">{replyTo.userName}</span>: „{truncate(replyTo.content, 70)}“
          </span>
        </p>
      )}

      <div className={cn(isDeleted && "opacity-60")}>
        <ClampedContent expandable={expandable}>
          <HighlightedMessage
            content={content}
            matches={matches}
            isAction={isAction}
            className={isDeleted ? "line-through decoration-[var(--color-destructive)]" : undefined}
          />

          <span className="ml-1.5 inline-flex flex-wrap items-center gap-1 align-middle">
            {isDeleted && (
              <Badge variant="destructive" title="Diese Nachricht wurde von der Moderation entfernt">
                <Trash2 className="size-3" />
                Gelöscht
              </Badge>
            )}
            {bits > 0 && <Badge variant="success">{formatNumber(bits)} Bits</Badge>}
            {isFirstMessage && <Badge variant="warning">Erste Nachricht</Badge>}
            {months !== null && months > 0 && (
              <Badge variant="secondary" title="Abo-Dauer laut Twitch-Abzeichen">
                {formatNumber(months)} Monate Abo
              </Badge>
            )}
          </span>
        </ClampedContent>
      </div>

      {/* Verwendete Emotes als Bilder */}
      {parsedEmotes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {parsedEmotes.map((emote) => (
            <span
              key={emote.id}
              title={`${emote.name} · ${emote.count}×`}
              className="flex items-center gap-0.5 rounded bg-[var(--color-muted)] px-1 py-0.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={emoteImageUrl(emote.id, "1.0")}
                alt={emote.name}
                width={18}
                height={18}
                loading="lazy"
                className="size-[18px] object-contain"
              />
              {emote.count > 1 && (
                <span className="text-[0.65rem] tabular-nums text-[var(--color-subtle)]">{emote.count}</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

import { cn } from "@/lib/utils";
import { severityStyle, splitByMatches, type TermMatch } from "@/lib/watchlist";

interface HighlightedMessageProps {
  content: string;
  matches: TermMatch[];
  /** Kursiv und in Markenfarbe – entspricht /me im Chat. */
  isAction?: boolean;
  className?: string;
}

/**
 * Zeigt eine Chatnachricht und hebt Treffer des Wortfilters hervor.
 * Ohne Treffer wird der Text unverändert ausgegeben.
 */
export function HighlightedMessage({ content, matches, isAction, className }: HighlightedMessageProps) {
  const segments = splitByMatches(content, matches);

  return (
    <span className={cn(isAction && "italic text-[var(--color-brand)]", className)}>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark
            key={index}
            title={`Beobachteter Begriff: ${segment.match.term}`}
            className={cn("rounded-[3px] px-0.5", severityStyle(segment.match.severity).mark)}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </span>
  );
}

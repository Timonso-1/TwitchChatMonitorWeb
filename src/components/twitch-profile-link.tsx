import { Twitch } from "lucide-react";
import { cn } from "@/lib/utils";

interface TwitchProfileLinkProps {
  /** Twitch-Login (kleingeschrieben) – Teil der Kanal-URL. */
  login: string;
  /** Mit Beschriftung statt nur Symbol. */
  withLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Verlinkt den oeffentlichen Twitch-Kanal eines Nutzers.
 * Bewusst mit rel="noopener noreferrer", weil das Ziel ausserhalb liegt.
 */
export function TwitchProfileLink({ login, withLabel, size = "md", className }: TwitchProfileLinkProps) {
  const normalized = login.trim().toLowerCase();
  if (!normalized) return null;

  return (
    <a
      href={`https://www.twitch.tv/${encodeURIComponent(normalized)}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`twitch.tv/${normalized} in neuem Tab öffnen`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md transition-colors",
        "text-[var(--color-muted-foreground)] hover:text-[#9147ff]",
        withLabel
          ? "border border-[var(--color-border-strong)] px-2.5 py-1 text-xs hover:border-[#9147ff]"
          : size === "sm"
            ? "size-5 justify-center"
            : "size-7 justify-center hover:bg-[var(--color-accent)]",
        className,
      )}
    >
      <Twitch className={size === "sm" ? "size-3.5" : "size-4"} />
      {withLabel && "Twitch-Kanal"}
      <span className="sr-only">Twitch-Kanal von {normalized} öffnen</span>
    </a>
  );
}

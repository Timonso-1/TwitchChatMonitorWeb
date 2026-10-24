import { cn } from "@/lib/utils";

interface ViewerAvatarProps {
  name: string;
  /** Profilbild aus der Twitch-API; fehlt es, werden Initialen gezeigt. */
  imageUrl?: string | null;
  /** Chatfarbe des Nutzers – färbt den Initialen-Fallback ein. */
  color?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "size-6 text-[0.6rem] rounded-md",
  md: "size-8 text-xs rounded-md",
  lg: "size-12 text-sm rounded-lg",
  xl: "size-16 text-xl rounded-lg",
} as const;

function initials(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "??";

  // Bei zusammengesetzten Namen die Anfangsbuchstaben nehmen.
  const parts = trimmed.split(/[\s_-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();

  return trimmed.slice(0, 2).toUpperCase();
}

/**
 * Rundes Profilbild mit Initialen-Fallback.
 * Bewusst ein natives img: die Twitch-CDN-Domain müsste sonst in
 * next.config.mjs freigegeben werden, und Bildoptimierung bringt hier nichts.
 */
export function ViewerAvatar({ name, imageUrl, color, size = "md", className }: ViewerAvatarProps) {
  const base = cn(
    "flex shrink-0 items-center justify-center overflow-hidden font-semibold select-none",
    SIZE_CLASSES[size],
    className,
  );

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        aria-hidden
        loading="lazy"
        className={cn(base, "bg-[var(--color-muted)] object-cover")}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(base, "bg-[var(--color-secondary)]")}
      style={color ? { backgroundColor: `${color}25`, color } : undefined}
    >
      {initials(name)}
    </span>
  );
}

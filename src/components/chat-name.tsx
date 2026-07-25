import type { CSSProperties, ReactNode } from "react";
import { chatColorPair } from "@/lib/twitch";
import { cn } from "@/lib/utils";

interface ChatNameProps {
  children: ReactNode;
  /** Twitch-Chatfarbe als Hex-Wert. */
  color?: string | null;
  className?: string;
}

/**
 * Zeigt einen Namen in seiner Twitch-Chatfarbe.
 *
 * Twitch erlaubt sehr helle Farben, die auf hellem Hintergrund unlesbar sind.
 * Deshalb werden beide Varianten als CSS-Variablen gesetzt; welche greift,
 * entscheidet die Theme-Klasse am html-Element (siehe globals.css).
 */
export function ChatName({ children, color, className }: ChatNameProps) {
  const pair = chatColorPair(color);

  if (!pair) {
    return <span className={className}>{children}</span>;
  }

  return (
    <span
      className={cn("chat-name", className)}
      style={{ "--chat-color-dark": pair.dark, "--chat-color-light": pair.light } as CSSProperties}
    >
      {children}
    </span>
  );
}

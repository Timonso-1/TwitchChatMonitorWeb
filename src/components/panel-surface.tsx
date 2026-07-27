import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelSurfaceProps {
  children: ReactNode;
  className?: string;
  /**
   * `padded` – Charts und freie Inhalte.
   * `flush` – Tabellen ohne Innenabstand.
   */
  variant?: "padded" | "flush";
}

/**
 * Gemeinsame Fläche für Charts, Tabellen und Listen –
 * abgerundet, mit Border, ohne Card-Header-Overhead.
 */
export function PanelSurface({ children, className, variant = "padded" }: PanelSurfaceProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]",
        variant === "padded" && "p-4 sm:p-5",
        variant === "flush" && "overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

import { Radio } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      {/* Sehr dezenter Lichtkegel im Hintergrund. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-60"
        style={{ background: "radial-gradient(ellipse at top, hsl(0 0% 100% / 0.05), transparent 70%)" }}
        aria-hidden
      />

      <div className="relative mb-7 flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-[var(--color-secondary)]">
          <Radio className="size-4" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">TwitchPanel</p>
          <p className="text-xs text-[var(--color-subtle)]">Chat-Monitor</p>
        </div>
      </div>

      <div className="relative w-full max-w-md">{children}</div>

      <p className="relative mt-7 max-w-sm text-center text-xs leading-relaxed text-[var(--color-subtle)]">
        Zugriff nur für autorisierte Benutzer. Alle Anmeldeversuche werden protokolliert.
      </p>
    </div>
  );
}

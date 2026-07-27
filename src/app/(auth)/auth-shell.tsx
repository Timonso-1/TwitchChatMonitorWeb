import Link from "next/link";
import { Twitch } from "lucide-react";

/**
 * Schmale Hülle für 2FA, Setup, Passwortwechsel und Verknüpfung:
 * Logo oben, Inhalt in der Mitte, Hinweis unten – einheitlich zum Login.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center">
        <Link href="/" className="mb-7 flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--color-secondary)]">
            <Twitch className="size-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-bold tracking-tight">TwitchPanel</span>
            <span className="block text-xs text-[var(--color-subtle)]">Chat-Monitor</span>
          </span>
        </Link>

        <div className="w-full">{children}</div>

        <p className="mt-7 max-w-sm text-center text-xs leading-relaxed text-[var(--color-subtle)]">
          Zugriff nur für autorisierte Benutzer. Alle Anmeldeversuche werden protokolliert.
        </p>
      </div>
    </div>
  );
}

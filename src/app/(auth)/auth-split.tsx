import type { ReactNode } from "react";
import { Twitch } from "lucide-react";

interface AuthSplitProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Rechte Fläche – Hinweis-/Kontextpanel. */
  panel: ReactNode;
}

/**
 * Zweispalten-Hülle für Auth-Schritte (Login, 2FA, Setup, …).
 * Links Formular, rechts ruhige Kontextfläche – gleiches Muster überall.
 */
export function AuthSplit({ title, description, children, panel }: AuthSplitProps) {
  return (
    <div className="grid min-h-dvh w-full lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-[22rem] space-y-8">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--color-secondary)]">
              <Twitch className="size-5" />
            </span>
            <span className="leading-tight">
              <span className="block text-lg font-bold tracking-tight">TwitchPanel</span>
              <span className="block text-xs text-[var(--color-subtle)]">Chat-Monitor</span>
            </span>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && <div className="text-sm text-[var(--color-muted-foreground)]">{description}</div>}
          </div>

          {children}

          <p className="text-xs leading-relaxed text-[var(--color-subtle)]">
            Zugriff nur für autorisierte Benutzer. Alle Anmeldeversuche werden protokolliert.
          </p>
        </div>
      </div>

      <div className="relative hidden overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-surface)] lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 70% 20%, color-mix(in srgb, var(--color-brand) 14%, transparent), transparent 70%)",
          }}
        />
        <div className="relative mx-auto flex w-full max-w-md flex-col justify-center px-10 py-12 xl:px-14">
          {panel}
        </div>
      </div>
    </div>
  );
}

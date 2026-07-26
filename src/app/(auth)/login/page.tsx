import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Twitch } from "lucide-react";
import { getSession, isTwoFactorEnforced } from "@/lib/auth/session";
import { getPublicActivity, getPublicStatus } from "@/lib/queries/public-status";
import { LoginForm } from "./login-form";
import { LoginStatus } from "./login-status";

export const metadata: Metadata = { title: "Anmelden" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect(session.twoFactorVerified ? "/dashboard" : "/login/2fa");
  }

  const [status, activity] = await Promise.all([getPublicStatus(), getPublicActivity()]);

  return (
    <div className="grid w-full max-w-4xl overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-[0_16px_60px_-24px_rgba(0,0,0,0.6)] lg:grid-cols-[1fr_1.05fr]">
      {/* Linke Spalte: Anmeldung */}
      <div className="flex flex-col justify-center gap-6 p-7 sm:p-9">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-[var(--color-secondary)]">
            <Twitch className="size-5" />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-bold tracking-tight">TwitchPanel</span>
            <span className="block text-xs text-[var(--color-subtle)]">Chat-Monitor</span>
          </span>
        </div>

        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Willkommen zurück</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Melde dich mit deinem Panel-Account an.
          </p>
        </div>

        <LoginForm twoFactorEnforced={isTwoFactorEnforced()} />

        <p className="text-xs leading-relaxed text-[var(--color-subtle)]">
          Zugriff nur für autorisierte Benutzer. Alle Anmeldeversuche werden protokolliert.
        </p>
      </div>

      {/* Rechte Spalte: Live-Status */}
      {status ? (
        <div className="hidden flex-col justify-center border-l border-[var(--color-border)] bg-[var(--color-surface)] p-8 lg:flex">
          <LoginStatus
            initial={{
              ...status,
              lastMessageAt: status.lastMessageAt?.toISOString() ?? null,
              activity,
            }}
          />
        </div>
      ) : (
        // Ohne Statusdaten bleibt die Fläche eine ruhige Markenseite.
        <div className="hidden flex-col items-center justify-center border-l border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center lg:flex">
          <Twitch className="size-10 text-[var(--color-subtle)]" />
          <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">Twitch-Chat-Überwachung</p>
        </div>
      )}
    </div>
  );
}

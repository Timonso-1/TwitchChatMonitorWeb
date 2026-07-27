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

  const statusPayload = status
    ? {
        ...status,
        lastMessageAt: status.lastMessageAt?.toISOString() ?? null,
        activity,
      }
    : null;

  return (
    <div className="grid min-h-dvh w-full lg:grid-cols-2">
      {/* Linke Spalte: Anmeldung */}
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
            <h1 className="text-2xl font-semibold tracking-tight">Willkommen zurück</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Melde dich mit deinem Panel-Account an.
            </p>
          </div>

          <LoginForm twoFactorEnforced={isTwoFactorEnforced()} />

          <p className="text-xs leading-relaxed text-[var(--color-subtle)]">
            Zugriff nur für autorisierte Benutzer. Alle Anmeldeversuche werden protokolliert.
          </p>
        </div>
      </div>

      {/* Rechte Spalte: Live-Status als dominante Fläche */}
      <div className="relative hidden overflow-hidden border-l border-[var(--color-border)] bg-[var(--color-surface)] lg:flex">
        {/* Subtiler Brand-Glow – atmosphärisch, nicht als Deko-Sticker */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 70% 20%, color-mix(in srgb, var(--color-brand) 14%, transparent), transparent 70%)",
          }}
        />

        <div className="relative flex w-full flex-col justify-center px-10 py-12 xl:px-14">
          {statusPayload ? (
            <LoginStatus initial={statusPayload} />
          ) : (
            <div className="flex flex-col items-center justify-center text-center">
              <span className="flex size-14 items-center justify-center rounded-xl bg-[var(--color-secondary)]">
                <Twitch className="size-7 text-[var(--color-muted-foreground)]" />
              </span>
              <p className="mt-4 text-sm text-[var(--color-muted-foreground)]">Twitch-Chat-Überwachung</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

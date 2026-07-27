import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { AuthSplit } from "../auth-split";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Passwort ändern" };

export default async function ChangePasswordPage() {
  const session = await getSession();

  if (!session) redirect("/login");
  if (session.user.totpEnabled && !session.twoFactorVerified) redirect("/login/2fa");

  const forced = session.user.mustChangePassword;

  return (
    <AuthSplit
      title="Passwort ändern"
      description={
        forced
          ? "Dein Passwort wurde von einem Administrator gesetzt. Bitte vergib ein eigenes, bevor du fortfährst."
          : "Nach der Änderung werden alle anderen Sitzungen beendet."
      }
      panel={
        <div className="space-y-6">
          <span className="flex size-14 items-center justify-center rounded-xl bg-[var(--color-secondary)]">
            <KeyRound className="size-7 text-[var(--color-brand)]" />
          </span>
          <div className="space-y-2">
            <p className="text-lg font-semibold tracking-tight">Sicheres Passwort</p>
            <p className="text-sm leading-relaxed text-[var(--color-muted-foreground)]">
              Wähle ein Passwort, das du nur für dieses Panel nutzt. Andere offene Sitzungen werden danach
              automatisch beendet.
            </p>
          </div>
        </div>
      }
    >
      <ChangePasswordForm />
    </AuthSplit>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { AuthSplit } from "../../auth-split";
import { TwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = { title: "Zwei-Faktor-Bestätigung" };

export default async function TwoFactorPage() {
  const session = await getSession();

  if (!session) redirect("/login");
  if (session.twoFactorVerified) redirect("/dashboard");
  if (!session.user.totpEnabled) redirect("/setup-2fa");

  const username = session.user.displayName ?? session.user.username;

  return (
    <AuthSplit
      title="Zwei-Faktor-Bestätigung"
      description={
        <>
          Angemeldet als <span className="font-medium text-[var(--color-foreground)]">{username}</span>.
        </>
      }
      panel={
        <div className="space-y-6">
          <span className="flex size-14 items-center justify-center rounded-xl bg-[var(--color-secondary)]">
            <ShieldCheck className="size-7 text-[var(--color-brand)]" />
          </span>

          <div className="space-y-2">
            <p className="text-lg font-semibold tracking-tight">Zusätzlicher Schutz</p>
            <p className="text-sm leading-relaxed text-[var(--color-muted-foreground)]">
              Bestätige deine Identität mit dem Code aus deiner Authenticator-App oder einem Recovery-Code,
              bevor du auf das Panel zugreifst.
            </p>
          </div>

          <ul className="space-y-3 border-t border-[var(--color-border)] pt-6 text-sm text-[var(--color-muted-foreground)]">
            <li className="flex gap-3">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
              Codes aus der App sind nur kurz gültig
            </li>
            <li className="flex gap-3">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
              Recovery-Codes gelten jeweils nur einmal
            </li>
            <li className="flex gap-3">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--color-brand)]" />
              Abbrechen beendet die aktuelle Anmeldung
            </li>
          </ul>
        </div>
      }
    >
      <TwoFactorForm />
    </AuthSplit>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { createTwoFactorSetup } from "@/lib/auth/setup";
import { AuthSplit } from "../auth-split";
import { SetupTwoFactorForm } from "./setup-form";

export const metadata: Metadata = { title: "Zwei-Faktor einrichten" };
export const dynamic = "force-dynamic";

export default async function SetupTwoFactorPage() {
  const session = await getSession();

  if (!session) redirect("/login");
  if (session.user.totpEnabled && !session.twoFactorVerified) redirect("/login/2fa");
  if (session.user.totpEnabled) redirect("/profile");

  const setup = await createTwoFactorSetup(session.user.email);

  return (
    <AuthSplit
      title="Zwei-Faktor einrichten"
      description={
        <>
          Scanne den QR-Code mit einer Authenticator-App und bestätige mit dem angezeigten Code.
        </>
      }
      panel={
        <div className="space-y-6">
          <span className="flex size-14 items-center justify-center rounded-xl bg-[var(--color-secondary)]">
            <ShieldCheck className="size-7 text-[var(--color-brand)]" />
          </span>
          <div className="space-y-2">
            <p className="text-lg font-semibold tracking-tight">Account absichern</p>
            <p className="text-sm leading-relaxed text-[var(--color-muted-foreground)]">
              Nach der Einrichtung brauchst du bei jeder Anmeldung zusätzlich den Code aus deiner App.
            </p>
          </div>
          <ul className="space-y-3 border-t border-[var(--color-border)] pt-6 text-sm text-[var(--color-muted-foreground)]">
            <li className="flex gap-3">
              <KeyRound className="mt-0.5 size-3.5 shrink-0 text-[var(--color-brand)]" />
              Recovery-Codes werden danach einmalig angezeigt
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--color-brand)]" />
              Speichere die Codes an einem sicheren Ort
            </li>
          </ul>
        </div>
      }
    >
      <SetupTwoFactorForm
        secret={setup.secret}
        secretToken={setup.secretToken}
        qrCode={setup.qrCode}
        accountLabel={session.user.email}
      />
    </AuthSplit>
  );
}

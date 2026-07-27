import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Twitch } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/actions/auth";
import { getSession, isTwoFactorEnforced } from "@/lib/auth/session";
import { isTwitchLinkEnforced, isTwitchOAuthConfigured } from "@/lib/auth/twitch-oauth";
import { AuthSplit } from "../auth-split";

export const metadata: Metadata = { title: "Twitch verknüpfen" };
export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  denied: "Du hast die Freigabe bei Twitch abgebrochen.",
  state: "Die Sitzung ist abgelaufen oder der Vorgang wurde manipuliert. Bitte erneut versuchen.",
  no_code: "Twitch hat keinen Autorisierungscode zurückgegeben.",
  exchange: "Die Antwort von Twitch konnte nicht verarbeitet werden. Bitte erneut versuchen.",
  already_linked: "Dieser Twitch-Account ist bereits mit einem anderen Panel-Account verknüpft.",
  twitch_error: "Twitch hat die Anfrage abgelehnt.",
  not_configured: "Die Twitch-Anbindung ist auf diesem Server nicht eingerichtet.",
};

export default async function LinkTwitchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.user.totpEnabled && !session.twoFactorVerified) redirect("/login/2fa");
  if (!session.user.totpEnabled && isTwoFactorEnforced()) redirect("/setup-2fa");
  if (session.user.mustChangePassword) redirect("/change-password");

  if (session.user.twitchUserId) redirect("/dashboard");
  if (!isTwitchLinkEnforced() || !isTwitchOAuthConfigured()) redirect("/dashboard");

  const { error } = await searchParams;
  const configured = isTwitchOAuthConfigured();

  return (
    <AuthSplit
      title="Twitch verknüpfen"
      description={
        <>
          Angemeldet als{" "}
          <span className="font-medium text-[var(--color-foreground)]">{session.user.username}</span>. Verbinde
          einmalig deinen Twitch-Account.
        </>
      }
      panel={
        <div className="space-y-6">
          <span className="flex size-14 items-center justify-center rounded-xl bg-[var(--color-secondary)]">
            <Twitch className="size-7 text-[var(--color-brand)]" />
          </span>
          <div className="space-y-2">
            <p className="text-lg font-semibold tracking-tight">Was dabei passiert</p>
            <p className="text-sm leading-relaxed text-[var(--color-muted-foreground)]">
              Anzeigename und Profilbild kommen von Twitch. Es werden keine Tokens gespeichert und keine
              Berechtigungen angefragt.
            </p>
          </div>
          <ul className="space-y-3 border-t border-[var(--color-border)] pt-6 text-sm text-[var(--color-muted-foreground)]">
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--color-success)]" />
              Nur Twitch-ID, Name und Profilbild
            </li>
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--color-success)]" />
              Token wird nach dem Abruf entwertet
            </li>
            <li className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--color-success)]" />
              Später nur durch einen Admin lösbar
            </li>
          </ul>
        </div>
      }
    >
      <div className="space-y-5">
        {error && (
          <Alert variant="destructive" role="alert">
            {ERROR_MESSAGES[error] ?? "Die Verknüpfung ist fehlgeschlagen."}
          </Alert>
        )}

        <Button asChild className="w-full" disabled={!configured}>
          <Link href="/auth/twitch/start" prefetch={false}>
            <Twitch />
            Mit Twitch verbinden
          </Link>
        </Button>

        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="sm" className="w-full">
            Abmelden
          </Button>
        </form>
      </div>
    </AuthSplit>
  );
}

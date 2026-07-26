import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Twitch } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { logoutAction } from "@/lib/actions/auth";
import { getSession, isTwoFactorEnforced } from "@/lib/auth/session";
import { isTwitchLinkEnforced, isTwitchOAuthConfigured } from "@/lib/auth/twitch-oauth";

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

  // Die vorherigen Pflichtschritte müssen abgeschlossen sein.
  if (session.user.totpEnabled && !session.twoFactorVerified) redirect("/login/2fa");
  if (!session.user.totpEnabled && isTwoFactorEnforced()) redirect("/setup-2fa");
  if (session.user.mustChangePassword) redirect("/change-password");

  // Bereits verknüpft oder gar nicht gefordert – dann hat die Seite keinen Zweck.
  if (session.user.twitchUserId) redirect("/dashboard");
  if (!isTwitchLinkEnforced() || !isTwitchOAuthConfigured()) redirect("/dashboard");

  const { error } = await searchParams;
  const configured = isTwitchOAuthConfigured();

  return (
    <AuthShell>
      <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-[var(--color-secondary)]">
            <Twitch className="size-4" />
          </span>
          Twitch verknüpfen
        </CardTitle>
        <CardDescription>
          Verbinde deinen Panel-Account einmalig mit deinem Twitch-Account. Anzeigename und Profilbild werden
          anschließend von dort übernommen.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && <Alert variant="destructive">{ERROR_MESSAGES[error] ?? "Die Verknüpfung ist fehlgeschlagen."}</Alert>}

        <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
          <p className="font-medium">Was dabei passiert</p>
          <ul className="space-y-1.5 text-[var(--color-muted-foreground)]">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--color-success)]" />
              Es werden nur deine Twitch-ID, dein Name und dein Profilbild gespeichert.
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--color-success)]" />
              Es werden keine Zugangstokens abgelegt — das Token wird direkt nach dem Abruf entwertet.
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--color-success)]" />
              Das Panel kann nichts in deinem Namen tun: es werden keine Berechtigungen angefragt.
            </li>
          </ul>
        </div>

        <p className="text-xs text-[var(--color-muted-foreground)]">
          Angemeldet als <span className="font-medium text-[var(--color-foreground)]">{session.user.username}</span>.
          Achte darauf, bei Twitch den richtigen Account auszuwählen — die Verknüpfung lässt sich später nur von einem
          Administrator lösen.
        </p>

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
      </CardContent>
      </Card>
    </AuthShell>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { KeyRound, MonitorSmartphone, ShieldCheck, ShieldOff } from "lucide-react";
import { RoleChip } from "@/components/role-chip";
import { StatCard } from "@/components/stat-card";
import { ThemeSwitch } from "@/components/theme-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardField, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProfilePasswordForm } from "./profile-password-form";
import { ProfileTwoFactorPanel } from "./profile-two-factor-panel";
import { revokeOwnSession } from "@/lib/actions/auth";
import { requireSession } from "@/lib/auth/guard";
import { permissionLabel } from "@/lib/auth/permissions";
import { isTwoFactorEnforced } from "@/lib/auth/session";
import { countUnusedRecoveryCodes } from "@/lib/auth/totp";
import { getAccountDetail } from "@/lib/queries/accounts";
import { THEME_COOKIE_NAME, isThemePreference } from "@/lib/theme";
import { formatDateTime, formatRelative, truncate } from "@/lib/utils";

export const metadata: Metadata = { title: "Profil & Sicherheit" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await requireSession();

  const [account, recoveryCodesLeft, cookieStore] = await Promise.all([
    getAccountDetail(session.user.uuid),
    session.user.totpEnabled ? countUnusedRecoveryCodes(session.user.uuid) : Promise.resolve(0),
    cookies(),
  ]);

  if (!account) return null;

  const rawTheme = cookieStore.get(THEME_COOKIE_NAME)?.value;
  const theme = isThemePreference(rawTheme) ? rawTheme : "system";
  const enforced = isTwoFactorEnforced();

  return (
    <>
      {/* Kopfbereich */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-[var(--color-secondary)] text-xl font-semibold">
            {(account.displayName ?? account.username).slice(0, 2).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {account.displayName ?? account.username}
              </h1>
              {account.roles.map((role) => (
                <RoleChip key={role.uuid} name={role.name} color={role.color} />
              ))}
            </div>

            <p className="text-sm text-[var(--color-muted-foreground)]">{account.email}</p>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={account.totpEnabled ? "success" : "warning"}>
                {account.totpEnabled ? "2FA aktiv" : "2FA fehlt"}
              </Badge>
              <Badge variant="muted">@{account.username}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Aktive Sitzungen"
          value={account.sessions.length}
          icon={MonitorSmartphone}
          accent="brand"
        />
        <StatCard
          label="Recovery-Codes übrig"
          value={account.totpEnabled ? recoveryCodesLeft : "—"}
          icon={KeyRound}
          accent={account.totpEnabled && recoveryCodesLeft <= 2 ? "warning" : "neutral"}
        />
        <StatCard
          label="Letzte Anmeldung"
          value={account.lastLoginAt ? formatRelative(account.lastLoginAt) : "—"}
          hint={account.lastLoginIp ?? undefined}
          icon={ShieldCheck}
          accent="success"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ProfilePasswordForm />

          <Card>
            <CardHeader>
              <CardTitle>Aktive Sitzungen</CardTitle>
              <CardDescription>
                Die aktuelle Sitzung ist markiert. Ein Passwortwechsel beendet alle anderen automatisch.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gerät</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Zuletzt aktiv</TableHead>
                    <TableHead>Läuft ab</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {account.sessions.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="max-w-64 text-xs">
                        {entry.userAgent ? truncate(entry.userAgent, 70) : "Unbekannt"}
                        {entry.id === session.id && (
                          <Badge variant="success" className="ml-2">
                            Diese Sitzung
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-[var(--color-muted-foreground)]">
                        {entry.ipAddress ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                        {formatRelative(entry.lastActiveAt)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                        {formatRelative(entry.expiresAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {entry.id !== session.id && (
                          <form action={revokeOwnSession}>
                            <input type="hidden" name="sessionId" value={entry.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              Beenden
                            </Button>
                          </form>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kontodaten</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <CardField label="Benutzername">{account.username}</CardField>
              <CardField label="E-Mail">{account.email}</CardField>
              <CardField label="Anzeigename">{account.displayName ?? "—"}</CardField>
              <CardField label="Angelegt">{formatDateTime(account.createdAt)}</CardField>
              <CardField label="Passwort geändert">
                {account.passwordChangedAt ? formatDateTime(account.passwordChangedAt) : "—"}
              </CardField>
              <CardField label="2FA aktiviert am">
                {account.totpConfirmedAt ? formatDateTime(account.totpConfirmedAt) : "—"}
              </CardField>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Erscheinungsbild</CardTitle>
              <CardDescription>Gilt für dieses Gerät und bleibt gespeichert.</CardDescription>
            </CardHeader>
            <CardContent>
              <ThemeSwitch value={theme} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {account.totpEnabled ? (
                  <ShieldCheck className="size-4 text-[var(--color-success)]" />
                ) : (
                  <ShieldOff className="size-4 text-[var(--color-warning)]" />
                )}
                Zwei-Faktor-Authentifizierung
              </CardTitle>
              <CardDescription>
                {account.totpEnabled
                  ? `Aktiv seit ${formatDateTime(account.totpConfirmedAt)}. ${recoveryCodesLeft} Recovery-Code(s) übrig.`
                  : enforced
                    ? "2FA ist verpflichtend und muss eingerichtet werden."
                    : "2FA ist für deinen Account nicht aktiv."}
              </CardDescription>
            </CardHeader>

            <CardContent>
              {account.totpEnabled ? (
                <ProfileTwoFactorPanel enforced={enforced} recoveryCodesLeft={recoveryCodesLeft} />
              ) : (
                <Button asChild className="w-full">
                  <Link href="/setup-2fa">2FA jetzt einrichten</Link>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deine Berechtigungen</CardTitle>
              <CardDescription>Ergeben sich aus deinen Rollen.</CardDescription>
            </CardHeader>
            <CardContent>
              {account.permissions.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">Keine Berechtigungen zugewiesen.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {account.permissions.map((permission) => (
                    <Badge key={permission} variant={permission === "*" ? "destructive" : "outline"}>
                      {permissionLabel(permission)}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

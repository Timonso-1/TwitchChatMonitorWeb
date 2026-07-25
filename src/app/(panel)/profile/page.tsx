import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { AlertTriangle, CheckCircle2, KeyRound, Palette, ShieldCheck, ShieldOff } from "lucide-react";
import { RoleChip } from "@/components/role-chip";
import { SessionDevice } from "@/components/session-device";
import { ThemeSwitch } from "@/components/theme-switch";
import { TwitchProfileLink } from "@/components/twitch-profile-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProfilePasswordForm } from "./profile-password-form";
import { ProfileTwoFactorPanel } from "./profile-two-factor-panel";
import { revokeOwnSession } from "@/lib/actions/auth";
import { requireSession } from "@/lib/auth/guard";
import { PERMISSION_GROUPS, WILDCARD_PERMISSION } from "@/lib/auth/permissions";
import { isTwoFactorEnforced } from "@/lib/auth/session";
import { countUnusedRecoveryCodes } from "@/lib/auth/totp";
import { getAccountDetail } from "@/lib/queries/accounts";
import { THEME_COOKIE_NAME, isThemePreference } from "@/lib/theme";
import { formatIpAddress } from "@/lib/user-agent";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";

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

  const hasWildcard = account.permissions.includes(WILDCARD_PERMISSION);
  const permissionSet = new Set(account.permissions);

  // Rechte nach Bereich gruppieren – eine flache Badge-Wolke ist unlesbar.
  const grantedGroups = PERMISSION_GROUPS.map((group) => ({
    label: group.label,
    granted: group.permissions.filter((permission) => hasWildcard || permissionSet.has(permission.value)),
    total: group.permissions.length,
  })).filter((group) => group.granted.length > 0);

  // Kleine Sicherheitsübersicht statt bloßer Zahlen.
  const checks = [
    {
      ok: account.totpEnabled,
      label: account.totpEnabled ? "Zwei-Faktor-Authentifizierung aktiv" : "Zwei-Faktor-Authentifizierung fehlt",
    },
    {
      ok: !account.totpEnabled || recoveryCodesLeft > 2,
      label:
        recoveryCodesLeft > 2
          ? `${recoveryCodesLeft} Recovery-Codes vorhanden`
          : `Nur noch ${recoveryCodesLeft} Recovery-Code(s)`,
    },
    {
      ok: account.sessions.length <= 3,
      label:
        account.sessions.length === 1
          ? "Nur diese eine Sitzung aktiv"
          : `${account.sessions.length} aktive Sitzungen`,
    },
  ];

  const openIssues = checks.filter((check) => !check.ok).length;

  return (
    <>
      {/* Kopfbereich mit allen Stammdaten */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {account.twitchProfileImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={account.twitchProfileImageUrl}
                alt=""
                aria-hidden
                className="size-16 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-[var(--color-secondary)] text-xl font-semibold">
                {(account.displayName ?? account.username).slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight">
                  {account.twitchDisplayName ?? account.displayName ?? account.username}
                </h1>
                {account.roles.map((role) => (
                  <RoleChip key={role.uuid} name={role.name} color={role.color} />
                ))}
                {account.twitchLogin && <TwitchProfileLink login={account.twitchLogin} size="sm" />}
              </div>

              <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-xs text-[var(--color-subtle)]">Benutzername</dt>
                  <dd className="truncate">@{account.username}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--color-subtle)]">E-Mail</dt>
                  <dd className="truncate">{account.email}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--color-subtle)]">Angelegt</dt>
                  <dd>{formatDateTime(account.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--color-subtle)]">Letzte Anmeldung</dt>
                  <dd>{account.lastLoginAt ? formatRelative(account.lastLoginAt) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--color-subtle)]">Twitch</dt>
                  <dd className="truncate">
                    {account.twitchLogin ? (
                      <>
                        @{account.twitchLogin}
                        <span className="ml-1.5 text-xs text-[var(--color-subtle)]">
                          seit {formatDateTime(account.twitchLinkedAt)}
                        </span>
                      </>
                    ) : (
                      <span className="text-[var(--color-muted-foreground)]">Nicht verknüpft</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </CardContent>
      </Card>

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
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {account.sessions.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <SessionDevice userAgent={entry.userAgent} />
                          {entry.id === session.id && <Badge variant="success">Diese Sitzung</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs text-[var(--color-muted-foreground)]">
                        {formatIpAddress(entry.ipAddress)}
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
              <CardTitle>Deine Berechtigungen</CardTitle>
              <CardDescription>
                {hasWildcard
                  ? "Als Superadmin hast du Zugriff auf alle Funktionen — auch auf zukünftige."
                  : "Ergeben sich aus deinen Rollen."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasWildcard ? (
                <div className="flex items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_8%,transparent)] px-3 py-2.5">
                  <ShieldCheck className="size-4 shrink-0 text-[var(--color-destructive)]" />
                  <span className="text-sm font-medium">Vollzugriff auf alle Bereiche</span>
                </div>
              ) : grantedGroups.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">Keine Berechtigungen zugewiesen.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {grantedGroups.map((group) => (
                    <div key={group.label} className="space-y-1.5">
                      <p className="flex items-center gap-2 text-xs font-medium text-[var(--color-muted-foreground)]">
                        {group.label}
                        <span className="text-[var(--color-subtle)]">
                          {group.granted.length}/{group.total}
                        </span>
                      </p>
                      <ul className="space-y-1">
                        {group.granted.map((permission) => (
                          <li key={permission.value} className="flex items-start gap-1.5 text-sm">
                            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--color-success)]" />
                            {permission.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Sicherheitsübersicht */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {openIssues === 0 ? (
                  <ShieldCheck className="size-4 text-[var(--color-success)]" />
                ) : (
                  <AlertTriangle className="size-4 text-[var(--color-warning)]" />
                )}
                Sicherheitsstatus
              </CardTitle>
              <CardDescription>
                {openIssues === 0 ? "Alles in Ordnung." : `${openIssues} Punkt(e) solltest du dir ansehen.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {checks.map((check) => (
                  <li key={check.label} className="flex items-start gap-2 text-sm">
                    {check.ok ? (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--color-success)]" />
                    ) : (
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--color-warning)]" />
                    )}
                    <span className={cn(!check.ok && "text-[var(--color-foreground)]")}>{check.label}</span>
                  </li>
                ))}
              </ul>
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
                  ? `Aktiv seit ${formatDateTime(account.totpConfirmedAt)}.`
                  : enforced
                    ? "Verpflichtend und noch nicht eingerichtet."
                    : "Für deinen Account nicht aktiv."}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
              {account.totpEnabled && (
                <div className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <KeyRound className="size-3.5 text-[var(--color-muted-foreground)]" />
                    Recovery-Codes
                  </span>
                  <Badge variant={recoveryCodesLeft > 2 ? "success" : "warning"}>{recoveryCodesLeft} übrig</Badge>
                </div>
              )}

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
              <CardTitle className="flex items-center gap-2">
                <Palette className="size-4 text-[var(--color-muted-foreground)]" />
                Erscheinungsbild
              </CardTitle>
              <CardDescription>Gilt für dieses Gerät und bleibt gespeichert.</CardDescription>
            </CardHeader>
            <CardContent>
              <ThemeSwitch value={theme} withLabels />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

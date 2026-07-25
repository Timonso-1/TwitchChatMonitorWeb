import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { RoleChip } from "@/components/role-chip";
import { SessionDevice } from "@/components/session-device";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountEditForm } from "./account-edit-form";
import { AccountSecurityActions } from "./account-security-actions";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission, permissionLabel } from "@/lib/auth/permissions";
import { getAccountDetail, listRoles } from "@/lib/queries/accounts";
import { formatIpAddress } from "@/lib/user-agent";
import { formatDateTime, formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ uuid: string }> }): Promise<Metadata> {
  const { uuid } = await params;
  const account = await getAccountDetail(uuid);
  return { title: account ? account.username : "Account" };
}

export default async function AccountDetailPage({ params }: { params: Promise<{ uuid: string }> }) {
  const session = await requirePermission(PERMISSIONS.ACCOUNTS_VIEW);
  const { uuid } = await params;

  const account = await getAccountDetail(uuid);
  if (!account) notFound();

  const roles = await listRoles();

  const isSuperadmin = session.user.permissions.includes("*");
  const isSelf = account.uuid === session.user.uuid;
  // Accounts mit gleicher oder hoeherer Stufe duerfen nicht bearbeitet werden.
  const outranked = !isSuperadmin && !isSelf && account.maxPriority >= session.user.maxPriority;

  const canUpdate = hasPermission(session.user.permissions, PERMISSIONS.ACCOUNTS_UPDATE) && !outranked;
  const canDelete =
    hasPermission(session.user.permissions, PERMISSIONS.ACCOUNTS_DELETE) && !outranked && !isSelf;
  const canReset2fa = hasPermission(session.user.permissions, PERMISSIONS.ACCOUNTS_RESET_2FA) && !outranked;
  const canManageSessions =
    hasPermission(session.user.permissions, PERMISSIONS.ACCOUNTS_MANAGE_SESSIONS) && !outranked;

  const assignableRoles = isSuperadmin ? roles : roles.filter((role) => role.priority < session.user.maxPriority);
  const isLocked = account.lockedUntil !== null && account.lockedUntil > new Date();

  return (
    <>
      <PageHeader
        title={account.displayName ?? account.username}
        description={account.email}
        backHref="/accounts"
        actions={
          <div className="flex flex-wrap gap-1">
            <Badge variant={account.isActive ? "success" : "muted"}>
              {account.isActive ? "Aktiv" : "Deaktiviert"}
            </Badge>
            <Badge variant={account.totpEnabled ? "success" : "warning"}>
              {account.totpEnabled ? "2FA aktiv" : "2FA fehlt"}
            </Badge>
            {isLocked && <Badge variant="destructive">Gesperrt</Badge>}
          </div>
        }
      />

      {outranked && (
        <Card>
          <CardContent className="p-4 text-sm text-[var(--color-muted-foreground)]">
            Dieser Account hat mindestens deine eigene Berechtigungsstufe. Du kannst ihn ansehen, aber nicht ändern.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {canUpdate ? (
            <AccountEditForm
              account={{
                uuid: account.uuid,
                username: account.username,
                email: account.email,
                displayName: account.displayName,
                isActive: account.isActive,
                roleUuids: account.roles.map((role) => role.uuid),
              }}
              roles={assignableRoles}
              isSelf={isSelf}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Stammdaten</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                <Detail label="Benutzername" value={account.username} />
                <Detail label="E-Mail" value={account.email} />
                <Detail label="Anzeigename" value={account.displayName ?? "—"} />
                <Detail
                  label="Rollen"
                  value={
                    <div className="flex flex-wrap gap-1">
                      {account.roles.map((role) => (
                        <RoleChip key={role.uuid} name={role.name} color={role.color} />
                      ))}
                    </div>
                  }
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Aktive Sitzungen ({account.sessions.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gerät</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>2FA</TableHead>
                    <TableHead>Zuletzt aktiv</TableHead>
                    <TableHead>Läuft ab</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {account.sessions.length === 0 ? (
                    <TableEmpty colSpan={5}>Keine aktiven Sitzungen.</TableEmpty>
                  ) : (
                    account.sessions.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <SessionDevice userAgent={entry.userAgent} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs text-[var(--color-muted-foreground)]">
                          {formatIpAddress(entry.ipAddress)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={entry.twoFactorVerified ? "success" : "warning"}>
                            {entry.twoFactorVerified ? "Bestätigt" : "Offen"}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                          {formatRelative(entry.lastActiveAt)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                          {formatRelative(entry.expiresAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Effektive Berechtigungen</CardTitle>
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

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sicherheitsstatus</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Detail label="Letzte Anmeldung" value={account.lastLoginAt ? formatDateTime(account.lastLoginAt) : "Noch nie"} />
              <Detail label="Letzte IP" value={account.lastLoginIp ?? "—"} />
              <Detail
                label="Passwort geändert"
                value={account.passwordChangedAt ? formatDateTime(account.passwordChangedAt) : "—"}
              />
              <Detail
                label="2FA aktiviert am"
                value={account.totpConfirmedAt ? formatDateTime(account.totpConfirmedAt) : "—"}
              />
              <Detail label="Angelegt" value={formatDateTime(account.createdAt)} />
              {isLocked && (
                <Detail
                  label="Gesperrt bis"
                  value={<span className="text-[var(--color-destructive)]">{formatDateTime(account.lockedUntil)}</span>}
                />
              )}
            </CardContent>
          </Card>

          <AccountSecurityActions
            account={{
              uuid: account.uuid,
              username: account.username,
              totpEnabled: account.totpEnabled,
              isLocked,
              activeSessions: account.sessions.length,
              twitchLogin: account.twitchLogin,
            }}
            canUpdate={canUpdate}
            canDelete={canDelete}
            canReset2fa={canReset2fa}
            canManageSessions={canManageSessions}
          />
        </div>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">{label}</p>
      <div className="break-words">{value}</div>
    </div>
  );
}

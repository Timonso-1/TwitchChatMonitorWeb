import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, ShieldAlert, ShieldOff, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FilterBar, FilterField } from "@/components/filter-bar";
import { RoleChip } from "@/components/role-chip";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { PanelSurface } from "@/components/panel-surface";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountCreateDialog } from "./account-create-dialog";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, hasPermission } from "@/lib/auth/permissions";
import { getAccountStats, listAccounts, listRoles } from "@/lib/queries/accounts";
import { formatDateTime, formatRelative, parsePositiveInt, parseSearchParam } from "@/lib/utils";

export const metadata: Metadata = { title: "Accounts" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const STATUS_OPTIONS = [
  { value: "all", label: "Alle" },
  { value: "active", label: "Aktiv" },
  { value: "inactive", label: "Deaktiviert" },
  { value: "locked", label: "Gesperrt" },
  { value: "no2fa", label: "Ohne 2FA" },
] as const;

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePermission(PERMISSIONS.ACCOUNTS_VIEW);
  const params = await searchParams;

  const search = parseSearchParam(params.search);
  const statusParam = parseSearchParam(params.status);
  const status = (STATUS_OPTIONS.find((option) => option.value === statusParam)?.value ?? "all") as
    | "all"
    | "active"
    | "inactive"
    | "locked"
    | "no2fa";
  const roleUuid = parseSearchParam(params.role);
  const page = parsePositiveInt(params.page, 1);

  const [roles, { items, total }, stats] = await Promise.all([
    listRoles(),
    listAccounts({ search, status, roleUuid, page, pageSize: PAGE_SIZE }),
    getAccountStats(),
  ]);

  const canCreate = hasPermission(session.user.permissions, PERMISSIONS.ACCOUNTS_CREATE);
  const isSuperadmin = session.user.permissions.includes("*");
  const assignableRoles = isSuperadmin
    ? roles
    : roles.filter((role) => role.priority < session.user.maxPriority);

  const now = new Date();

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Panel-Accounts, deren Rollen und Sicherheitsstatus."
        actions={canCreate ? <AccountCreateDialog roles={assignableRoles} /> : undefined}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/accounts">
          <StatCard
            label="Accounts"
            value={stats.total}
            icon={Users}
            accent="brand"
            className="transition-colors hover:border-[var(--color-border-strong)]"
          />
        </Link>
        <Link href="/accounts?status=no2fa">
          <StatCard
            label="Ohne 2FA"
            value={stats.no2fa}
            icon={ShieldOff}
            accent={stats.no2fa > 0 ? "warning" : "neutral"}
            className="transition-colors hover:border-[var(--color-border-strong)]"
          />
        </Link>
        <Link href="/accounts?status=locked">
          <StatCard
            label="Gesperrt"
            value={stats.locked}
            icon={ShieldAlert}
            accent={stats.locked > 0 ? "destructive" : "neutral"}
            className="transition-colors hover:border-[var(--color-border-strong)]"
          />
        </Link>
        <Link href="/accounts?status=inactive">
          <StatCard
            label="Deaktiviert"
            value={stats.total - stats.active}
            icon={KeyRound}
            accent="neutral"
            className="transition-colors hover:border-[var(--color-border-strong)]"
          />
        </Link>
      </div>

      <FilterBar action="/accounts" hasActiveFilters={Boolean(search) || status !== "all" || Boolean(roleUuid)}>
        <FilterField label="Suche">
          <Input name="search" defaultValue={search ?? ""} placeholder="Name oder E-Mail" />
        </FilterField>

        <FilterField label="Status" className="w-full space-y-1.5 sm:w-44">
          <Select name="status" defaultValue={status}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="Rolle">
          <Select name="role" defaultValue={roleUuid ?? ""}>
            <option value="">Alle Rollen</option>
            {roles.map((role) => (
              <option key={role.uuid} value={role.uuid}>
                {role.name}
              </option>
            ))}
          </Select>
        </FilterField>
      </FilterBar>

      <PanelSurface variant="flush">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Rollen</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>2FA</TableHead>
                <TableHead className="text-right">Sitzungen</TableHead>
                <TableHead>Letzte Anmeldung</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableEmpty colSpan={6} title="Keine Accounts gefunden" />
              ) : (
                items.map((account) => {
                  const isLocked = account.lockedUntil !== null && account.lockedUntil > now;

                  return (
                    <TableRow key={account.uuid}>
                      <TableCell>
                        <Link href={`/accounts/${account.uuid}`} className="font-medium hover:underline">
                          {account.displayName ?? account.username}
                        </Link>
                        <span className="block text-xs text-[var(--color-muted-foreground)]">{account.email}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {account.roles.length === 0 ? (
                            <span className="text-xs text-[var(--color-muted-foreground)]">Keine Rolle</span>
                          ) : (
                            account.roles.map((role) => <RoleChip key={role.uuid} name={role.name} color={role.color} />)
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={account.isActive ? "success" : "muted"}>
                            {account.isActive ? "Aktiv" : "Deaktiviert"}
                          </Badge>
                          {isLocked && <Badge variant="destructive">Gesperrt</Badge>}
                          {account.mustChangePassword && <Badge variant="warning">PW-Wechsel</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={account.totpEnabled ? "success" : "warning"}>
                          {account.totpEnabled ? "Aktiv" : "Fehlt"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{account.activeSessions}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                        {account.lastLoginAt ? formatRelative(account.lastLoginAt) : "Noch nie"}
                        <span className="block">{formatDateTime(account.createdAt)} angelegt</span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <Pagination
            basePath="/accounts"
            params={{ search, status: status === "all" ? undefined : status, role: roleUuid }}
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
          />
      </PanelSurface>
    </>
  );
}

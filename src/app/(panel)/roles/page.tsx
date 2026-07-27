import type { Metadata } from "next";
import { Layers, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleDialog } from "./role-dialog";
import { RoleCardActions } from "./role-card-actions";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, PERMISSION_GROUPS, WILDCARD_PERMISSION, hasPermission } from "@/lib/auth/permissions";
import { listRoles } from "@/lib/queries/accounts";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Rollen" };
export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const session = await requirePermission(PERMISSIONS.ROLES_VIEW);
  const roles = await listRoles();

  const canManage = hasPermission(session.user.permissions, PERMISSIONS.ROLES_MANAGE);
  const isSuperadmin = session.user.permissions.includes(WILDCARD_PERMISSION);
  const maxAssignablePriority = isSuperadmin ? 99 : session.user.maxPriority - 1;

  const systemCount = roles.filter((role) => role.isSystem).length;
  const accountsTotal = roles.reduce((sum, role) => sum + role.userCount, 0);

  return (
    <>
      <PageHeader
        title="Rollen & Berechtigungen"
        description="Rollen bündeln Berechtigungen. Eine höhere Priorität schützt vor Bearbeitung durch niedrigere Rollen."
        actions={
          canManage ? (
            <RoleDialog mode="create" isSuperadmin={isSuperadmin} maxPriority={maxAssignablePriority} />
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Rollen" value={roles.length} hint={`${systemCount} davon System`} icon={Layers} accent="brand" />
        <StatCard label="Accounts zugewiesen" value={accountsTotal} icon={Users} accent="success" />
        <StatCard
          label="Höchste Priorität"
          value={roles[0]?.priority ?? 0}
          hint={roles[0]?.name}
          icon={ShieldCheck}
          accent="warning"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((role) => {
          const isWildcard = role.permissions.includes(WILDCARD_PERMISSION);
          const editable = canManage && (isSuperadmin || role.priority < session.user.maxPriority);

          return (
            <Card key={role.uuid}>
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-block size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: role.color }}
                    />
                    {role.name}
                    {role.isSystem && <Badge variant="muted">System</Badge>}
                  </CardTitle>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    <span className="font-mono">{role.key}</span> · Priorität {role.priority} ·{" "}
                    {formatNumber(role.userCount)} Account(s)
                  </p>
                  <div className="h-1 w-28 overflow-hidden rounded-full bg-[var(--color-muted)]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(role.priority, 100)}%`, backgroundColor: role.color }}
                    />
                  </div>
                  {role.description && (
                    <p className="text-sm text-[var(--color-muted-foreground)]">{role.description}</p>
                  )}
                </div>

                {editable && (
                  <RoleCardActions
                    role={{
                      uuid: role.uuid,
                      key: role.key,
                      name: role.name,
                      description: role.description,
                      priority: role.priority,
                      color: role.color,
                      isSystem: role.isSystem,
                      permissions: role.permissions,
                      userCount: role.userCount,
                    }}
                    isSuperadmin={isSuperadmin}
                    maxPriority={maxAssignablePriority}
                  />
                )}
              </CardHeader>

              <CardContent>
                {isWildcard ? (
                  <Badge variant="destructive">Vollzugriff auf alle Funktionen</Badge>
                ) : role.permissions.length === 0 ? (
                  <span className="text-sm text-[var(--color-muted-foreground)]">Keine Berechtigungen</span>
                ) : (
                  <div className="space-y-3">
                    {PERMISSION_GROUPS.map((group) => {
                      const granted = group.permissions.filter((permission) =>
                        role.permissions.includes(permission.value),
                      );
                      if (granted.length === 0) return null;

                      return (
                        <div key={group.key}>
                          <p className="text-xs font-medium text-[var(--color-subtle)]">{group.label}</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {granted.map((permission) => (
                              <Badge key={permission.value} variant="outline" title={permission.description}>
                                {permission.label}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

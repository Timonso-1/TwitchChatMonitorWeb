import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleDialog } from "./role-dialog";
import { RoleCardActions } from "./role-card-actions";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS, WILDCARD_PERMISSION, hasPermission, permissionLabel } from "@/lib/auth/permissions";
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
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {role.permissions.length === 0 ? (
                      <span className="text-sm text-[var(--color-muted-foreground)]">Keine Berechtigungen</span>
                    ) : (
                      role.permissions.map((permission) => (
                        <Badge key={permission} variant="outline">
                          {permissionLabel(permission)}
                        </Badge>
                      ))
                    )}
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

"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { RoleChip } from "@/components/role-chip";
import { updateAccountAction } from "@/lib/actions/accounts";
import { IDLE_STATE } from "@/lib/actions/types";

interface AccountEditFormProps {
  account: {
    uuid: string;
    username: string;
    email: string;
    displayName: string | null;
    isActive: boolean;
    roleUuids: string[];
  };
  roles: Array<{ uuid: string; name: string; color: string; description: string | null; priority: number }>;
  isSelf: boolean;
}

export function AccountEditForm({ account, roles, isSelf }: AccountEditFormProps) {
  const [state, formAction] = useActionState(updateAccountAction, IDLE_STATE);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stammdaten</CardTitle>
        <CardDescription>
          Der Benutzername ist unveränderlich. Alle Änderungen werden im Audit-Log protokolliert.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="uuid" value={account.uuid} />

          {state.status === "error" && state.message && <Alert variant="destructive">{state.message}</Alert>}
          {state.status === "success" && state.message && <Alert variant="success">{state.message}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="username">Benutzername</Label>
              <Input id="username" value={account.username} disabled />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="displayName">Anzeigename</Label>
              <Input id="displayName" name="displayName" defaultValue={account.displayName ?? ""} maxLength={96} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">E-Mail</Label>
            <Input id="email" name="email" type="email" defaultValue={account.email} required maxLength={255} />
            {state.fieldErrors?.email?.map((error) => (
              <p key={error} className="text-xs text-[var(--color-destructive)]">
                {error}
              </p>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Rollen</Label>
            {roles.length === 0 ? (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Es stehen keine Rollen zur Verfügung, die du vergeben darfst.
              </p>
            ) : (
              <div className="space-y-2 rounded-md border border-[var(--color-border)] p-3">
                {roles.map((role) => (
                  <label key={role.uuid} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="roles"
                      value={role.uuid}
                      defaultChecked={account.roleUuids.includes(role.uuid)}
                      className="mt-0.5 size-4 accent-[var(--color-primary)]"
                    />
                    <span className="min-w-0">
                      <RoleChip name={role.name} color={role.color} />
                      <span className="ml-1.5 text-xs text-[var(--color-muted-foreground)]">
                        Priorität {role.priority}
                      </span>
                      {role.description && (
                        <span className="block text-xs text-[var(--color-muted-foreground)]">{role.description}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={account.isActive}
              disabled={isSelf}
              className="size-4 accent-[var(--color-primary)]"
            />
            Account aktiv
            {isSelf && (
              <span className="text-xs text-[var(--color-muted-foreground)]">
                (der eigene Account kann nicht deaktiviert werden)
              </span>
            )}
          </label>
          {isSelf && <input type="hidden" name="isActive" value="true" />}

          <SubmitButton pendingLabel="Speichern…">Änderungen speichern</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

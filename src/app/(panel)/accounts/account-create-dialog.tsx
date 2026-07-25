"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { PasswordRequirements } from "@/components/password-requirements";
import { RoleChip } from "@/components/role-chip";
import { createAccountAction } from "@/lib/actions/accounts";
import { IDLE_STATE } from "@/lib/actions/types";

interface RoleOption {
  uuid: string;
  name: string;
  color: string;
  description: string | null;
}

export function AccountCreateDialog({ roles }: { roles: RoleOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createAccountAction, IDLE_STATE);
  const router = useRouter();

  const initialPassword = state.data?.initialPassword as string | undefined;

  function handleClose() {
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) router.refresh();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          Account anlegen
        </Button>
      </DialogTrigger>

      <DialogContent>
        {state.status === "success" && initialPassword ? (
          <>
            <DialogHeader>
              <DialogTitle>Account angelegt</DialogTitle>
              <DialogDescription>{state.message}</DialogDescription>
            </DialogHeader>

            <Alert variant="warning" title="Startpasswort">
              Dieses Passwort wird nur jetzt angezeigt. Übermittle es dem Nutzer über einen sicheren Kanal.
            </Alert>

            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 font-mono text-sm">
                {initialPassword}
              </code>
              <CopyButton value={initialPassword} />
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Fertig</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Account anlegen</DialogTitle>
              <DialogDescription>
                Der Nutzer muss das Passwort bei der ersten Anmeldung ändern und 2FA einrichten.
              </DialogDescription>
            </DialogHeader>

            <form action={formAction} className="space-y-4">
              {state.status === "error" && state.message && <Alert variant="destructive">{state.message}</Alert>}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="acc-username">Benutzername</Label>
                  <Input id="acc-username" name="username" required maxLength={64} autoFocus />
                  {state.fieldErrors?.username?.map((error) => (
                    <p key={error} className="text-xs text-[var(--color-destructive)]">
                      {error}
                    </p>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="acc-displayName">Anzeigename (optional)</Label>
                  <Input id="acc-displayName" name="displayName" maxLength={96} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="acc-email">E-Mail</Label>
                <Input id="acc-email" name="email" type="email" required maxLength={255} />
                {state.fieldErrors?.email?.map((error) => (
                  <p key={error} className="text-xs text-[var(--color-destructive)]">
                    {error}
                  </p>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="acc-password">Startpasswort (optional)</Label>
                <Input
                  id="acc-password"
                  name="password"
                  type="text"
                  autoComplete="off"
                  placeholder="Leer lassen für automatische Erzeugung"
                  maxLength={128}
                />
                {state.fieldErrors?.password?.map((error) => (
                  <p key={error} className="text-xs text-[var(--color-destructive)]">
                    {error}
                  </p>
                ))}
                <PasswordRequirements />
              </div>

              <div className="space-y-2">
                <Label>Rollen</Label>
                {roles.length === 0 ? (
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Es stehen keine Rollen zur Verfügung, die du vergeben darfst.
                  </p>
                ) : (
                  <div className="max-h-40 space-y-2 overflow-y-auto scrollbar-thin rounded-md border border-[var(--color-border)] p-3">
                    {roles.map((role) => (
                      <label key={role.uuid} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="roles"
                          value={role.uuid}
                          className="mt-0.5 size-4 accent-[var(--color-primary)]"
                        />
                        <span className="min-w-0">
                          <RoleChip name={role.name} color={role.color} />
                          {role.description && (
                            <span className="block text-xs text-[var(--color-muted-foreground)]">
                              {role.description}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Abbrechen
                </Button>
                <SubmitButton pendingLabel="Anlegen…">Anlegen</SubmitButton>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

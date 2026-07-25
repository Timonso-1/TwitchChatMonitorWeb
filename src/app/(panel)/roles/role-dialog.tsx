"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { createRoleAction, updateRoleAction } from "@/lib/actions/roles";
import { IDLE_STATE } from "@/lib/actions/types";
import { PERMISSION_GROUPS, WILDCARD_PERMISSION } from "@/lib/auth/permissions";

export interface RoleFormData {
  uuid: string;
  key: string;
  name: string;
  description: string | null;
  priority: number;
  color: string;
  isSystem: boolean;
  permissions: string[];
}

interface RoleDialogProps {
  mode: "create" | "edit";
  role?: RoleFormData;
  isSuperadmin: boolean;
  maxPriority: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Bei "edit" wird der Trigger extern gesteuert. */
  hideTrigger?: boolean;
}

export function RoleDialog({
  mode,
  role,
  isSuperadmin,
  maxPriority,
  open: controlledOpen,
  onOpenChange,
  hideTrigger,
}: RoleDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [state, formAction] = useActionState(
    mode === "create" ? createRoleAction : updateRoleAction,
    IDLE_STATE,
  );
  const router = useRouter();

  const [wildcard, setWildcard] = useState(role?.permissions.includes(WILDCARD_PERMISSION) ?? false);

  useEffect(() => {
    if (state.status === "success") {
      setOpen(false);
      router.refresh();
    }
  }, [state, setOpen, router]);

  const isSystem = role?.isSystem ?? false;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus />
            Rolle anlegen
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Rolle anlegen" : `Rolle "${role?.name}" bearbeiten`}</DialogTitle>
          <DialogDescription>
            {isSystem
              ? "Bei Systemrollen sind Schlüssel und Priorität unveränderlich."
              : "Abhängige Rechte werden automatisch ergänzt (z. B. zieht „Channel anlegen“ das Recht „Channels ansehen“ nach sich)."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {role && <input type="hidden" name="uuid" value={role.uuid} />}

          {state.status === "error" && state.message && <Alert variant="destructive">{state.message}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Name</Label>
              <Input id="role-name" name="name" defaultValue={role?.name ?? ""} required maxLength={96} />
              {state.fieldErrors?.name?.map((error) => (
                <p key={error} className="text-xs text-[var(--color-destructive)]">
                  {error}
                </p>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role-key">Schlüssel</Label>
              <Input
                id="role-key"
                name="key"
                defaultValue={role?.key ?? ""}
                required
                maxLength={64}
                readOnly={isSystem}
                className={isSystem ? "opacity-60" : undefined}
              />
              {state.fieldErrors?.key?.map((error) => (
                <p key={error} className="text-xs text-[var(--color-destructive)]">
                  {error}
                </p>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role-description">Beschreibung</Label>
            <Textarea
              id="role-description"
              name="description"
              defaultValue={role?.description ?? ""}
              maxLength={255}
              rows={2}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="role-priority">Priorität (0–{maxPriority})</Label>
              <Input
                id="role-priority"
                name="priority"
                type="number"
                min={0}
                max={maxPriority}
                defaultValue={role?.priority ?? 10}
                required
                readOnly={isSystem}
                className={isSystem ? "opacity-60" : undefined}
              />
              {state.fieldErrors?.priority?.map((error) => (
                <p key={error} className="text-xs text-[var(--color-destructive)]">
                  {error}
                </p>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role-color">Farbe</Label>
              <Input
                id="role-color"
                name="color"
                type="color"
                defaultValue={role?.color ?? "#8b5cf6"}
                className="h-9 p-1"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Berechtigungen</Label>

            {isSuperadmin && (
              <label className="flex items-start gap-2 rounded-md border border-[color-mix(in_srgb,var(--color-destructive)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] p-3 text-sm">
                <input
                  type="checkbox"
                  name="permissions"
                  value={WILDCARD_PERMISSION}
                  checked={wildcard}
                  onChange={(event) => setWildcard(event.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--color-destructive)]"
                />
                <span>
                  <span className="font-medium">Vollzugriff (*)</span>
                  <span className="block text-xs text-[var(--color-muted-foreground)]">
                    Diese Rolle erhält alle aktuellen und zukünftigen Rechte.
                  </span>
                </span>
              </label>
            )}

            <div
              className={`max-h-72 space-y-4 overflow-y-auto scrollbar-thin rounded-md border border-[var(--color-border)] p-3 ${
                wildcard ? "pointer-events-none opacity-40" : ""
              }`}
            >
              {PERMISSION_GROUPS.map((group) => (
                <fieldset key={group.key} className="space-y-2">
                  <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    {group.label}
                  </legend>
                  {group.permissions.map((permission) => (
                    <label key={permission.value} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="permissions"
                        value={permission.value}
                        defaultChecked={role?.permissions.includes(permission.value)}
                        disabled={wildcard}
                        className="mt-0.5 size-4 accent-[var(--color-primary)]"
                      />
                      <span className="min-w-0">
                        {permission.label}
                        <span className="block text-xs text-[var(--color-muted-foreground)]">
                          {permission.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <SubmitButton pendingLabel="Speichern…">{mode === "create" ? "Anlegen" : "Speichern"}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

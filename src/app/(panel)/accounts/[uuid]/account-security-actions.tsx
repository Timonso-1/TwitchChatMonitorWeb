"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LockOpen, LogOut, ShieldOff, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  deleteAccountAction,
  resetAccountPasswordAction,
  resetAccountTwoFactorAction,
  revokeAccountSessionsAction,
  unlockAccountAction,
} from "@/lib/actions/accounts";
import { IDLE_STATE, type ActionState } from "@/lib/actions/types";

interface AccountSecurityActionsProps {
  account: {
    uuid: string;
    username: string;
    totpEnabled: boolean;
    isLocked: boolean;
    activeSessions: number;
  };
  canUpdate: boolean;
  canDelete: boolean;
  canReset2fa: boolean;
  canManageSessions: boolean;
}

export function AccountSecurityActions({
  account,
  canUpdate,
  canDelete,
  canReset2fa,
  canManageSessions,
}: AccountSecurityActionsProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [resetPwState, resetPwAction] = useActionState(resetAccountPasswordAction, IDLE_STATE);
  const [reset2faState, reset2faAction] = useActionState(resetAccountTwoFactorAction, IDLE_STATE);
  const [unlockState, unlockAction] = useActionState(unlockAccountAction, IDLE_STATE);
  const [revokeState, revokeAction] = useActionState(revokeAccountSessionsAction, IDLE_STATE);

  useEffect(() => {
    const states: ActionState[] = [reset2faState, unlockState, revokeState];
    if (states.some((state) => state.status === "success")) router.refresh();
  }, [reset2faState, unlockState, revokeState, router]);

  const newPassword = resetPwState.data?.initialPassword as string | undefined;
  const nothingAvailable = !canUpdate && !canDelete && !canReset2fa && !canManageSessions;

  if (nothingAvailable) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Sicherheitsaktionen</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {[resetPwState, reset2faState, unlockState, revokeState].map((state, index) =>
            state.status === "error" && state.message ? (
              <Alert key={index} variant="destructive">
                {state.message}
              </Alert>
            ) : null,
          )}

          {newPassword && (
            <Alert variant="warning" title="Neues Startpasswort">
              <div className="space-y-2">
                <p>Wird nur jetzt angezeigt. Sicher an den Nutzer übermitteln.</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded border border-[var(--color-border)] bg-[var(--color-muted)] px-2 py-1 font-mono text-xs">
                    {newPassword}
                  </code>
                  <CopyButton value={newPassword} />
                </div>
              </div>
            </Alert>
          )}

          {canUpdate && (
            <form action={resetPwAction}>
              <input type="hidden" name="uuid" value={account.uuid} />
              <SubmitButton variant="outline" size="sm" className="w-full" pendingLabel="Zurücksetzen…">
                <KeyRound />
                Passwort zurücksetzen
              </SubmitButton>
            </form>
          )}

          {canReset2fa && account.totpEnabled && (
            <form action={reset2faAction}>
              <input type="hidden" name="uuid" value={account.uuid} />
              <SubmitButton variant="outline" size="sm" className="w-full" pendingLabel="Zurücksetzen…">
                <ShieldOff />
                2FA zurücksetzen
              </SubmitButton>
            </form>
          )}

          {canUpdate && account.isLocked && (
            <form action={unlockAction}>
              <input type="hidden" name="uuid" value={account.uuid} />
              <SubmitButton variant="outline" size="sm" className="w-full" pendingLabel="Entsperren…">
                <LockOpen />
                Sperre aufheben
              </SubmitButton>
            </form>
          )}

          {canManageSessions && account.activeSessions > 0 && (
            <form action={revokeAction}>
              <input type="hidden" name="uuid" value={account.uuid} />
              <SubmitButton variant="outline" size="sm" className="w-full" pendingLabel="Beenden…">
                <LogOut />
                Alle Sitzungen beenden ({account.activeSessions})
              </SubmitButton>
            </form>
          )}

          {canDelete && (
            <Button variant="destructive" size="sm" className="w-full" onClick={() => setDeleteOpen(true)}>
              <Trash2 />
              Account löschen
            </Button>
          )}
        </CardContent>
      </Card>

      {canDelete && <DeleteDialog account={account} open={deleteOpen} onOpenChange={setDeleteOpen} />}
    </>
  );
}

function DeleteDialog({
  account,
  open,
  onOpenChange,
}: {
  account: { uuid: string; username: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction] = useActionState(deleteAccountAction, IDLE_STATE);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      onOpenChange(false);
      router.push("/accounts");
    }
  }, [state, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Account löschen</DialogTitle>
          <DialogDescription>
            Der Account wird mit allen Sitzungen, Rollenzuweisungen und Recovery-Codes entfernt. Audit-Einträge bleiben
            erhalten.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="uuid" value={account.uuid} />

          {state.status === "error" && state.message && <Alert variant="destructive">{state.message}</Alert>}

          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm">
              Zur Bestätigung <span className="font-mono font-semibold">{account.username}</span> eingeben
            </Label>
            <Input id="delete-confirm" name="confirmation" autoComplete="off" required />
            {state.fieldErrors?.confirmation?.map((error) => (
              <p key={error} className="text-xs text-[var(--color-destructive)]">
                {error}
              </p>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Löschen…">
              Endgültig löschen
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { PasswordRequirements } from "@/components/password-requirements";
import { changeOwnPassword } from "@/lib/actions/auth";
import { IDLE_STATE } from "@/lib/actions/types";

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changeOwnPassword, IDLE_STATE);

  return (
    <div className="space-y-5">
      {state.status === "error" && state.message && (
        <Alert variant="destructive" role="alert">
          {state.message}
        </Alert>
      )}

      {state.status === "success" && (
        <Alert variant="success" title="Passwort geändert">
          {state.message}
          <div className="pt-2">
            <Button size="sm" asChild>
              <Link href="/dashboard">Weiter zum Panel</Link>
            </Button>
          </div>
        </Alert>
      )}

      {state.status !== "success" && (
        <form action={formAction} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Aktuelles Passwort</Label>
            <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" required />
            {state.fieldErrors?.currentPassword?.map((error) => (
              <p key={error} className="text-xs text-[var(--color-destructive)]">
                {error}
              </p>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="newPassword">Neues Passwort</Label>
            <PasswordInput id="newPassword" name="newPassword" autoComplete="new-password" required />
            {state.fieldErrors?.newPassword?.map((error) => (
              <p key={error} className="text-xs text-[var(--color-destructive)]">
                {error}
              </p>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Neues Passwort bestätigen</Label>
            <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" required />
            {state.fieldErrors?.confirmPassword?.map((error) => (
              <p key={error} className="text-xs text-[var(--color-destructive)]">
                {error}
              </p>
            ))}
          </div>

          <PasswordRequirements />

          <SubmitButton className="w-full" pendingLabel="Speichern…">
            Passwort ändern
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

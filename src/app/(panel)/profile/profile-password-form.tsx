"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { PasswordRequirements } from "@/components/password-requirements";
import { changeOwnPassword } from "@/lib/actions/auth";
import { IDLE_STATE } from "@/lib/actions/types";

export function ProfilePasswordForm() {
  const [state, formAction] = useActionState(changeOwnPassword, IDLE_STATE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passwort ändern</CardTitle>
        <CardDescription>Nach der Änderung werden alle anderen Sitzungen beendet.</CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.status === "error" && state.message && <Alert variant="destructive">{state.message}</Alert>}
          {state.status === "success" && state.message && <Alert variant="success">{state.message}</Alert>}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="profile-current">Aktuelles Passwort</Label>
              <Input id="profile-current" name="currentPassword" type="password" autoComplete="current-password" required />
              {state.fieldErrors?.currentPassword?.map((error) => (
                <p key={error} className="text-xs text-[var(--color-destructive)]">
                  {error}
                </p>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-new">Neues Passwort</Label>
              <Input id="profile-new" name="newPassword" type="password" autoComplete="new-password" required />
              {state.fieldErrors?.newPassword?.map((error) => (
                <p key={error} className="text-xs text-[var(--color-destructive)]">
                  {error}
                </p>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-confirm">Bestätigen</Label>
              <Input id="profile-confirm" name="confirmPassword" type="password" autoComplete="new-password" required />
              {state.fieldErrors?.confirmPassword?.map((error) => (
                <p key={error} className="text-xs text-[var(--color-destructive)]">
                  {error}
                </p>
              ))}
            </div>
          </div>

          <PasswordRequirements />

          <SubmitButton pendingLabel="Speichern…">Passwort ändern</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

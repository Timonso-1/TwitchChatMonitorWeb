"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { PasswordRequirements } from "@/components/password-requirements";
import { changeOwnPassword } from "@/lib/actions/auth";
import { IDLE_STATE } from "@/lib/actions/types";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, formAction] = useActionState(changeOwnPassword, IDLE_STATE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passwort ändern</CardTitle>
        <CardDescription>
          {forced
            ? "Dein Passwort wurde von einem Administrator gesetzt. Bitte vergib ein eigenes, bevor du fortfährst."
            : "Nach der Änderung werden alle anderen Sitzungen beendet."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {state.status === "error" && state.message && <Alert variant="destructive">{state.message}</Alert>}
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
          <form action={formAction} className="space-y-4">
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
      </CardContent>
    </Card>
  );
}

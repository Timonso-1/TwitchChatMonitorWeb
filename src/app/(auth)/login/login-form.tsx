"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { loginAction } from "@/lib/actions/auth";
import { IDLE_STATE } from "@/lib/actions/types";

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, IDLE_STATE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anmelden</CardTitle>
        <CardDescription>Melde dich mit deinem Panel-Account an.</CardDescription>
      </CardHeader>

      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.status === "error" && state.message && <Alert variant="destructive">{state.message}</Alert>}

          <div className="space-y-1.5">
            <Label htmlFor="identifier">Benutzername oder E-Mail</Label>
            <Input
              id="identifier"
              name="identifier"
              autoComplete="username"
              autoFocus
              required
              maxLength={255}
              aria-invalid={Boolean(state.fieldErrors?.identifier)}
            />
            {state.fieldErrors?.identifier?.map((error) => (
              <p key={error} className="text-xs text-[var(--color-destructive)]">
                {error}
              </p>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              aria-invalid={Boolean(state.fieldErrors?.password)}
            />
            {state.fieldErrors?.password?.map((error) => (
              <p key={error} className="text-xs text-[var(--color-destructive)]">
                {error}
              </p>
            ))}
          </div>

          <SubmitButton className="w-full" pendingLabel="Anmelden…">
            <LogIn />
            Anmelden
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

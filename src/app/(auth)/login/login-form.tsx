"use client";

import { useActionState } from "react";
import { AtSign, LogIn, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { loginAction } from "@/lib/actions/auth";
import { IDLE_STATE } from "@/lib/actions/types";

export function LoginForm({ twoFactorEnforced }: { twoFactorEnforced: boolean }) {
  const [state, formAction] = useActionState(loginAction, IDLE_STATE);

  return (
    <form action={formAction} className="space-y-4">
      {state.status === "error" && state.message && (
        <Alert variant="destructive" role="alert">
          {state.message}
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="identifier">Benutzername oder E-Mail</Label>

        <div className="relative">
          <AtSign className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-subtle)]" />
          <Input
            id="identifier"
            name="identifier"
            autoComplete="username"
            autoFocus
            required
            maxLength={255}
            spellCheck={false}
            placeholder="timonso"
            aria-invalid={Boolean(state.fieldErrors?.identifier)}
            className="pl-9"
          />
        </div>

        {state.fieldErrors?.identifier?.map((error) => (
          <p key={error} className="text-xs text-[var(--color-destructive)]">
            {error}
          </p>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Passwort</Label>

        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          maxLength={128}
          placeholder="••••••••••••"
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

      {twoFactorEnforced && (
        <p className="flex items-start gap-2 text-xs text-[var(--color-muted-foreground)]">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--color-success)]" />
          Nach der Anmeldung folgt die Bestätigung per Zwei-Faktor-Authentifizierung.
        </p>
      )}
    </form>
  );
}

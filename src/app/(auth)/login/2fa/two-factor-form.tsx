"use client";

import { useActionState, useState } from "react";
import { KeyRound } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { cancelLoginAction, verifyTwoFactorAction } from "@/lib/actions/auth";
import { IDLE_STATE } from "@/lib/actions/types";

export function TwoFactorForm() {
  const [state, formAction] = useActionState(verifyTwoFactorAction, IDLE_STATE);
  const [mode, setMode] = useState<"totp" | "recovery">("totp");

  const isRecovery = mode === "recovery";

  return (
    <div className="space-y-5">
      {state.status === "error" && state.message && (
        <Alert variant="destructive" role="alert">
          {state.message}
        </Alert>
      )}

      {/* key erzwingt Neuaufbau des Feldes beim Moduswechsel */}
      <form action={formAction} className="space-y-5" key={mode}>
        <input type="hidden" name="mode" value={mode} />

        <div className="space-y-1.5">
          <Label htmlFor="code">{isRecovery ? "Recovery-Code" : "Authenticator-Code"}</Label>
          <Input
            id="code"
            name="code"
            autoFocus
            autoComplete="one-time-code"
            inputMode={isRecovery ? "text" : "numeric"}
            placeholder={isRecovery ? "XXXX-XXXX-XXXX" : "123456"}
            maxLength={isRecovery ? 20 : 6}
            required
            className={isRecovery ? "font-mono tracking-widest" : "text-center font-mono text-lg tracking-[0.5em]"}
          />
          <p className="text-xs text-[var(--color-subtle)]">
            {isRecovery
              ? "Gib einen deiner Recovery-Codes ein."
              : "Sechsstelliger Code aus deiner Authenticator-App."}
          </p>
        </div>

        <SubmitButton className="w-full" pendingLabel="Prüfen…">
          Bestätigen
        </SubmitButton>
      </form>

      <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto justify-start p-0"
          onClick={() => setMode(isRecovery ? "totp" : "recovery")}
        >
          <KeyRound />
          {isRecovery ? "Authenticator-Code verwenden" : "Recovery-Code verwenden"}
        </Button>

        <form action={cancelLoginAction}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-[var(--color-muted-foreground)]"
          >
            Abbrechen
          </Button>
        </form>
      </div>
    </div>
  );
}

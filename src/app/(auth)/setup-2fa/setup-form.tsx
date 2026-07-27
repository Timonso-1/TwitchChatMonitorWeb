"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { RecoveryCodeList } from "@/components/recovery-code-list";
import { confirmTwoFactorSetup } from "@/lib/actions/auth";
import { IDLE_STATE } from "@/lib/actions/types";

interface SetupTwoFactorFormProps {
  secret: string;
  secretToken: string;
  qrCode: string;
  accountLabel: string;
}

export function SetupTwoFactorForm({ secret, secretToken, qrCode, accountLabel }: SetupTwoFactorFormProps) {
  const [state, formAction] = useActionState(confirmTwoFactorSetup, IDLE_STATE);

  const recoveryCodes = (state.data?.recoveryCodes as string[] | undefined) ?? null;

  if (state.status === "success" && recoveryCodes) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-2.5 rounded-lg border border-[color-mix(in_srgb,var(--color-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_8%,transparent)] px-3 py-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Zwei-Faktor ist aktiv</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Speichere diese Recovery-Codes. Jeder Code funktioniert genau einmal und wird dir nie wieder angezeigt.
            </p>
          </div>
        </div>

        <RecoveryCodeList codes={recoveryCodes} />

        <a
          href="/dashboard"
          className="flex h-9 w-full items-center justify-center rounded-md bg-[var(--color-primary)] text-sm font-medium text-[var(--color-primary-foreground)] transition-colors hover:opacity-90"
        >
          Codes gesichert – weiter zum Panel
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {state.status === "error" && state.message && (
        <Alert variant="destructive" role="alert">
          {state.message}
        </Alert>
      )}

      <div className="flex justify-center rounded-lg border border-[var(--color-border)] bg-white p-4">
        {/* Data-URL aus dem Server – bewusst ein natives img statt next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrCode} alt="QR-Code für die Authenticator-App" width={200} height={200} />
      </div>

      <div className="space-y-1.5">
        <Label>Manuelle Eingabe</Label>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-3 py-2 font-mono text-xs">
            {secret}
          </code>
          <CopyButton value={secret} />
        </div>
        <p className="text-xs text-[var(--color-subtle)]">Konto: {accountLabel}</p>
      </div>

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="secretToken" value={secretToken} />

        <div className="space-y-1.5">
          <Label htmlFor="code">Code aus der App</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            required
            className="text-center font-mono text-lg tracking-[0.5em]"
          />
          {state.fieldErrors?.code?.map((error) => (
            <p key={error} className="text-xs text-[var(--color-destructive)]">
              {error}
            </p>
          ))}
        </div>

        <SubmitButton className="w-full" pendingLabel="Aktivieren…">
          Aktivieren
        </SubmitButton>
      </form>
    </div>
  );
}

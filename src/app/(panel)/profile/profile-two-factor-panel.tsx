"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ShieldOff } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { RecoveryCodeList } from "@/components/recovery-code-list";
import { disableOwnTwoFactor, regenerateOwnRecoveryCodes } from "@/lib/actions/auth";
import { IDLE_STATE } from "@/lib/actions/types";

interface ProfileTwoFactorPanelProps {
  enforced: boolean;
  recoveryCodesLeft: number;
}

export function ProfileTwoFactorPanel({ enforced, recoveryCodesLeft }: ProfileTwoFactorPanelProps) {
  const [regenOpen, setRegenOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  return (
    <div className="space-y-3">
      {recoveryCodesLeft <= 2 && (
        <Alert variant="warning">
          Nur noch {recoveryCodesLeft} Recovery-Code(s) übrig. Erzeuge jetzt neue, solange du Zugriff hast.
        </Alert>
      )}

      <Button variant="outline" size="sm" className="w-full" onClick={() => setRegenOpen(true)}>
        <RefreshCw />
        Recovery-Codes neu erzeugen
      </Button>

      {!enforced && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setDisableOpen(true)}>
          <ShieldOff />
          2FA deaktivieren
        </Button>
      )}

      <RegenerateDialog open={regenOpen} onOpenChange={setRegenOpen} />
      {!enforced && <DisableDialog open={disableOpen} onOpenChange={setDisableOpen} />}
    </div>
  );
}

function RegenerateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [state, formAction] = useActionState(regenerateOwnRecoveryCodes, IDLE_STATE);
  const router = useRouter();

  const codes = (state.data?.recoveryCodes as string[] | undefined) ?? null;

  function handleClose() {
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recovery-Codes neu erzeugen</DialogTitle>
          <DialogDescription>
            {codes
              ? "Speichere die neuen Codes. Die bisherigen sind ab sofort ungültig."
              : "Bestätige mit deinem Passwort. Alle bisherigen Codes werden ungültig."}
          </DialogDescription>
        </DialogHeader>

        {codes ? (
          <>
            <RecoveryCodeList codes={codes} />
            <DialogFooter>
              <Button onClick={handleClose}>Codes gesichert</Button>
            </DialogFooter>
          </>
        ) : (
          <form action={formAction} className="space-y-4">
            {state.status === "error" && state.message && <Alert variant="destructive">{state.message}</Alert>}

            <div className="space-y-1.5">
              <Label htmlFor="regen-password">Passwort</Label>
              <Input id="regen-password" name="password" type="password" autoComplete="current-password" required />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Abbrechen
              </Button>
              <SubmitButton pendingLabel="Erzeugen…">Neue Codes erzeugen</SubmitButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DisableDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [state, formAction] = useActionState(disableOwnTwoFactor, IDLE_STATE);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      onOpenChange(false);
      router.refresh();
    }
  }, [state, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zwei-Faktor-Authentifizierung deaktivieren</DialogTitle>
          <DialogDescription>
            Dein Account ist danach nur noch durch das Passwort geschützt. Das wird im Audit-Log vermerkt.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {state.status === "error" && state.message && <Alert variant="destructive">{state.message}</Alert>}

          <div className="space-y-1.5">
            <Label htmlFor="disable-password">Passwort</Label>
            <Input id="disable-password" name="password" type="password" autoComplete="current-password" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="disable-code">Aktueller 2FA-Code</Label>
            <Input
              id="disable-code"
              name="code"
              inputMode="numeric"
              maxLength={6}
              required
              className="text-center font-mono tracking-[0.4em]"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Deaktivieren…">
              Deaktivieren
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

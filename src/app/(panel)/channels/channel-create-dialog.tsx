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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { createChannelAction } from "@/lib/actions/channels";
import { IDLE_STATE } from "@/lib/actions/types";

export function ChannelCreateDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createChannelAction, IDLE_STATE);
  const router = useRouter();

  useEffect(() => {
    if (state.status === "success") {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          Channel hinzufügen
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Channel hinzufügen</DialogTitle>
          <DialogDescription>
            Der Bot beginnt die Aufzeichnung, sobald der Channel aktiv ist.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {state.status === "error" && state.message && <Alert variant="destructive">{state.message}</Alert>}

          <div className="space-y-1.5">
            <Label htmlFor="create-name">Channel-Name</Label>
            <Input id="create-name" name="name" placeholder="z. B. timonso" required maxLength={64} autoFocus />
            {state.fieldErrors?.name?.map((error) => (
              <p key={error} className="text-xs text-[var(--color-destructive)]">
                {error}
              </p>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-broadcasterId">Broadcaster-ID</Label>
            <Input
              id="create-broadcasterId"
              name="broadcasterId"
              placeholder="z. B. 123456789"
              inputMode="numeric"
              required
              maxLength={32}
            />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Die numerische Twitch-User-ID des Broadcasters.
            </p>
            {state.fieldErrors?.broadcasterId?.map((error) => (
              <p key={error} className="text-xs text-[var(--color-destructive)]">
                {error}
              </p>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked className="size-4 accent-[var(--color-primary)]" />
            Channel sofort aktivieren
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <SubmitButton pendingLabel="Anlegen…">Anlegen</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

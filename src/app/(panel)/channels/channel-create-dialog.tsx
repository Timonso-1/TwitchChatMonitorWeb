"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
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

/** Wartezeit, bevor ein Tippstopp als „fertig“ gilt und die Abfrage startet. */
const RESOLVE_DEBOUNCE_MS = 500;

export function ChannelCreateDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createChannelAction, IDLE_STATE);
  const router = useRouter();

  const [name, setName] = useState("");
  const [broadcasterId, setBroadcasterId] = useState("");
  const [resolving, setResolving] = useState<"name" | "id" | null>(null);

  // Merkt sich, welches Feld zuletzt automatisch befüllt wurde – so
  // überschreibt das Autofill keine Eingabe, die der Nutzer selbst gemacht hat.
  const autofilledName = useRef<string | null>(null);
  const autofilledId = useRef<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (state.status === "success") {
      setOpen(false);
      setName("");
      setBroadcasterId("");
      autofilledName.current = null;
      autofilledId.current = null;
      router.refresh();
    }
  }, [state, router]);

  async function resolve(query: string, dir: "name-to-id" | "id-to-name") {
    const thisRequest = ++requestId.current;
    setResolving(dir === "name-to-id" ? "id" : "name");

    try {
      const response = await fetch(
        `/api/twitch/resolve?dir=${dir}&q=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      );
      if (!response.ok || thisRequest !== requestId.current) return;

      const data = (await response.json()) as { found: boolean; userId?: string; login?: string };
      if (!data.found || thisRequest !== requestId.current) return;

      if (dir === "name-to-id" && data.userId) {
        setBroadcasterId((current) => {
          // Nicht überschreiben, wenn der Nutzer inzwischen selbst etwas eingetragen hat.
          if (current && current !== autofilledId.current) return current;
          autofilledId.current = data.userId!;
          return data.userId!;
        });
      } else if (dir === "id-to-name" && data.login) {
        setName((current) => {
          if (current && current !== autofilledName.current) return current;
          autofilledName.current = data.login!;
          return data.login!;
        });
      }
    } catch {
      // Stilles Scheitern – Autofill ist eine Komfortfunktion, kein Muss.
    } finally {
      if (thisRequest === requestId.current) setResolving(null);
    }
  }

  // Tippen: mit Verzögerung abfragen, damit nicht jeder Tastendruck einen Request auslöst.
  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 3) return;
    if (broadcasterId && broadcasterId !== autofilledId.current) return;

    const timer = window.setTimeout(() => void resolve(trimmed, "name-to-id"), RESOLVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  useEffect(() => {
    const trimmed = broadcasterId.trim();
    if (!/^\d{3,}$/.test(trimmed)) return;
    if (name && name !== autofilledName.current) return;

    const timer = window.setTimeout(() => void resolve(trimmed, "id-to-name"), RESOLVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcasterId]);

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
            <Label htmlFor="create-name" className="flex items-center gap-1.5">
              Channel-Name
              {resolving === "name" && <Loader2 className="size-3 animate-spin text-[var(--color-subtle)]" />}
            </Label>
            <Input
              id="create-name"
              name="name"
              placeholder="z. B. timonso"
              required
              maxLength={64}
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={(event) => {
                const trimmed = event.target.value.trim();
                if (trimmed.length >= 3 && (!broadcasterId || broadcasterId === autofilledId.current)) {
                  void resolve(trimmed, "name-to-id");
                }
              }}
            />
            {state.fieldErrors?.name?.map((error) => (
              <p key={error} className="text-xs text-[var(--color-destructive)]">
                {error}
              </p>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-broadcasterId" className="flex items-center gap-1.5">
              Broadcaster-ID
              {resolving === "id" && <Loader2 className="size-3 animate-spin text-[var(--color-subtle)]" />}
            </Label>
            <Input
              id="create-broadcasterId"
              name="broadcasterId"
              placeholder="z. B. 123456789"
              inputMode="numeric"
              required
              maxLength={32}
              value={broadcasterId}
              onChange={(event) => setBroadcasterId(event.target.value)}
              onBlur={(event) => {
                const trimmed = event.target.value.trim();
                if (/^\d{3,}$/.test(trimmed) && (!name || name === autofilledName.current)) {
                  void resolve(trimmed, "id-to-name");
                }
              }}
            />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Die numerische Twitch-User-ID des Broadcasters. Wird beim Namen automatisch ermittelt.
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

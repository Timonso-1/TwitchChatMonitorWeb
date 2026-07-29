"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionToast } from "@/components/ui/toast";
import { deleteChannelAction, toggleChannelActiveAction, updateChannelAction } from "@/lib/actions/channels";
import { IDLE_STATE } from "@/lib/actions/types";

interface ChannelSummary {
  uuid: string;
  name: string;
  broadcasterId: string;
  active: boolean;
}

interface ChannelRowActionsProps {
  channel: ChannelSummary;
  canUpdate: boolean;
  canDelete: boolean;
}

export function ChannelRowActions({ channel, canUpdate, canDelete }: ChannelRowActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleState, toggleAction] = useActionState(toggleChannelActiveAction, IDLE_STATE);
  const router = useRouter();

  // Ohne Toast bliebe ein fehlgeschlagenes Deaktivieren voellig unsichtbar:
  // das Dropdown hat keinen Platz für eine Meldung.
  useActionToast(toggleState, () => {
    setMenuOpen(false);
    router.refresh();
  });

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal />
            <span className="sr-only">Aktionen für {channel.name}</span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          {canUpdate && (
            <>
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                <Pencil />
                Bearbeiten
              </DropdownMenuItem>

              {/* Form muss aussen bleiben; onSelect preventDefault hält das Menü
                  offen, sonst unmountet Radix die Form vor dem Server-Action-Submit. */}
              <form action={toggleAction} className="w-full">
                <input type="hidden" name="uuid" value={channel.uuid} />
                <DropdownMenuItem asChild onSelect={(event) => event.preventDefault()}>
                  <button type="submit" className="flex w-full items-center gap-2">
                    <Power />
                    {channel.active ? "Deaktivieren" : "Aktivieren"}
                  </button>
                </DropdownMenuItem>
              </form>
            </>
          )}

          {canUpdate && canDelete && <DropdownMenuSeparator />}

          {canDelete && (
            <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
              <Trash2 />
              Löschen
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canUpdate && <EditDialog channel={channel} open={editOpen} onOpenChange={setEditOpen} />}
      {canDelete && <DeleteDialog channel={channel} open={deleteOpen} onOpenChange={setDeleteOpen} />}
    </>
  );
}

function EditDialog({
  channel,
  open,
  onOpenChange,
}: {
  channel: ChannelSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction] = useActionState(updateChannelAction, IDLE_STATE);
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
          <DialogTitle>Channel bearbeiten</DialogTitle>
          <DialogDescription>Änderungen werden protokolliert.</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="uuid" value={channel.uuid} />

          {state.status === "error" && state.message && <Alert variant="destructive">{state.message}</Alert>}

          <div className="space-y-1.5">
            <Label htmlFor={`edit-name-${channel.uuid}`}>Channel-Name</Label>
            <Input id={`edit-name-${channel.uuid}`} name="name" defaultValue={channel.name} required maxLength={64} />
            {state.fieldErrors?.name?.map((error) => (
              <p key={error} className="text-xs text-[var(--color-destructive)]">
                {error}
              </p>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`edit-bid-${channel.uuid}`}>Broadcaster-ID</Label>
            <Input
              id={`edit-bid-${channel.uuid}`}
              name="broadcasterId"
              defaultValue={channel.broadcasterId}
              inputMode="numeric"
              required
              maxLength={32}
            />
            {state.fieldErrors?.broadcasterId?.map((error) => (
              <p key={error} className="text-xs text-[var(--color-destructive)]">
                {error}
              </p>
            ))}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={channel.active}
              className="size-4 accent-[var(--color-primary)]"
            />
            Channel aktiv
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <SubmitButton pendingLabel="Speichern…">Speichern</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  channel,
  open,
  onOpenChange,
}: {
  channel: ChannelSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction] = useActionState(deleteChannelAction, IDLE_STATE);
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
          <DialogTitle>Channel löschen</DialogTitle>
          <DialogDescription>
            Der Channel-Eintrag wird entfernt. Bereits aufgezeichnete Nachrichten, Events und Moderationsaktionen
            bleiben in der Datenbank erhalten.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="uuid" value={channel.uuid} />

          {state.status === "error" && state.message && <Alert variant="destructive">{state.message}</Alert>}

          <div className="space-y-1.5">
            <Label htmlFor={`confirm-${channel.uuid}`}>
              Zur Bestätigung <span className="font-mono font-semibold">{channel.name}</span> eingeben
            </Label>
            <Input id={`confirm-${channel.uuid}`} name="confirmation" autoComplete="off" required />
            {state.fieldErrors?.confirmation?.map((error) => (
              <p key={error} className="text-xs text-[var(--color-destructive)]">
                {error}
              </p>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Löschen…">
              Endgültig löschen
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

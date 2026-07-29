"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pause, Pencil, Play, Trash2 } from "lucide-react";
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
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionToast } from "@/components/ui/toast";
import { WatchTermDialog, type WatchTermFormData } from "./watch-term-dialog";
import { deleteWatchTermAction, toggleWatchTermAction } from "@/lib/actions/watchlist";
import { IDLE_STATE } from "@/lib/actions/types";

interface WatchTermActionsProps {
  term: WatchTermFormData;
  channels: Array<{ uuid: string; name: string }>;
}

export function WatchTermActions({ term, channels }: WatchTermActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleState, toggleAction] = useActionState(toggleWatchTermAction, IDLE_STATE);
  const router = useRouter();

  // Ohne Toast bliebe ein fehlgeschlagenes Pausieren völlig unsichtbar:
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
            <span className="sr-only">Aktionen für {term.term}</span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil />
            Bearbeiten
          </DropdownMenuItem>

          {/* Form muss aussen bleiben; onSelect preventDefault hält das Menü
              offen, sonst unmountet Radix die Form vor dem Server-Action-Submit. */}
          <form action={toggleAction} className="w-full">
            <input type="hidden" name="id" value={term.id} />
            <DropdownMenuItem asChild onSelect={(event) => event.preventDefault()}>
              <button type="submit" className="flex w-full items-center gap-2">
                {term.active ? <Pause /> : <Play />}
                {term.active ? "Pausieren" : "Aktivieren"}
              </button>
            </DropdownMenuItem>
          </form>

          <DropdownMenuSeparator />

          <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
            <Trash2 />
            Entfernen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WatchTermDialog
        mode="edit"
        term={term}
        channels={channels}
        open={editOpen}
        onOpenChange={setEditOpen}
        hideTrigger
      />

      <DeleteDialog term={term} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}

/**
 * Rückfrage vor dem Entfernen.
 *
 * Anders als beim Channel ohne Abtippen des Namens: an einem Begriff hängen
 * keine Daten, er lässt sich jederzeit neu anlegen. Eine Rückfrage genügt,
 * damit ein Fehlklick im Dropdown ihn nicht sofort löscht.
 */
function DeleteDialog({
  term,
  open,
  onOpenChange,
}: {
  term: WatchTermFormData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction] = useActionState(deleteWatchTermAction, IDLE_STATE);
  const router = useRouter();

  // Fehler zeigt der Dialog inline neben dem Button; nur der Erfolg braucht
  // einen Toast, weil der Dialog dann bereits geschlossen ist.
  useActionToast(
    state,
    () => {
      onOpenChange(false);
      router.refresh();
    },
    { showErrors: false },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Begriff entfernen</DialogTitle>
          <DialogDescription>
            <span className="font-mono font-semibold">{term.term}</span> wird nicht mehr überwacht. Bereits
            aufgezeichnete Treffer bleiben erhalten.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="id" value={term.id} />

          {state.status === "error" && state.message && <Alert variant="destructive">{state.message}</Alert>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Entfernen…">
              Entfernen
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

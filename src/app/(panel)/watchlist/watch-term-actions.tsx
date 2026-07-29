"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [toggleState, toggleAction] = useActionState(toggleWatchTermAction, IDLE_STATE);
  const [deleteState, deleteAction] = useActionState(deleteWatchTermAction, IDLE_STATE);
  const router = useRouter();

  useEffect(() => {
    if (toggleState.status === "success" || deleteState.status === "success") {
      setMenuOpen(false);
      router.refresh();
    }
  }, [toggleState, deleteState, router]);

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

          <form action={deleteAction} className="w-full">
            <input type="hidden" name="id" value={term.id} />
            <DropdownMenuItem asChild destructive onSelect={(event) => event.preventDefault()}>
              <button type="submit" className="flex w-full items-center gap-2">
                <Trash2 />
                Entfernen
              </button>
            </DropdownMenuItem>
          </form>
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
    </>
  );
}

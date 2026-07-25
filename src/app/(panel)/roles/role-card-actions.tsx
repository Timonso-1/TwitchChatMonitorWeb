"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SubmitButton } from "@/components/ui/submit-button";
import { RoleDialog, type RoleFormData } from "./role-dialog";
import { deleteRoleAction } from "@/lib/actions/roles";
import { IDLE_STATE } from "@/lib/actions/types";

interface RoleCardActionsProps {
  role: RoleFormData & { userCount: number };
  isSuperadmin: boolean;
  maxPriority: number;
}

export function RoleCardActions({ role, isSuperadmin, maxPriority }: RoleCardActionsProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal />
            <span className="sr-only">Aktionen für {role.name}</span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil />
            Bearbeiten
          </DropdownMenuItem>
          {!role.isSystem && (
            <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}>
              <Trash2 />
              Löschen
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <RoleDialog
        mode="edit"
        role={role}
        isSuperadmin={isSuperadmin}
        maxPriority={role.isSystem ? Math.max(maxPriority, role.priority) : maxPriority}
        open={editOpen}
        onOpenChange={setEditOpen}
        hideTrigger
      />

      {!role.isSystem && <DeleteDialog role={role} open={deleteOpen} onOpenChange={setDeleteOpen} />}
    </>
  );
}

function DeleteDialog({
  role,
  open,
  onOpenChange,
}: {
  role: { uuid: string; name: string; userCount: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction] = useActionState(deleteRoleAction, IDLE_STATE);
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
          <DialogTitle>Rolle löschen</DialogTitle>
          <DialogDescription>
            {role.userCount > 0
              ? `Diese Rolle ist noch ${role.userCount} Account(s) zugewiesen und kann erst nach dem Entfernen der Zuweisungen gelöscht werden.`
              : `Die Rolle "${role.name}" wird dauerhaft entfernt.`}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="uuid" value={role.uuid} />

          {state.status === "error" && state.message && <Alert variant="destructive">{state.message}</Alert>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <SubmitButton variant="destructive" disabled={role.userCount > 0} pendingLabel="Löschen…">
              Löschen
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

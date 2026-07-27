"use client";

import * as React from "react";
import { MessageContent } from "@/components/message-content";
import { MessageDetailDialog } from "@/components/message-detail-dialog";

type MessageContentProps = React.ComponentProps<typeof MessageContent>;

interface MessageCellProps extends Omit<MessageContentProps, "expandable"> {
  messageId: string;
}

/**
 * Nachrichtenzelle, die sich anklicken lässt und den Detaildialog öffnet.
 *
 * Die Schaltfläche liegt bewusst als Fläche über dem Inhalt statt ihn zu
 * umschliessen: Absätze und Listen dürfen nicht in einer <button> stehen,
 * und der „Mehr anzeigen“-Umschalter wäre darin ein Knopf im Knopf. Er
 * entfällt hier deshalb – seine Aufgabe übernimmt der Dialog.
 */
export function MessageCell({ messageId, ...content }: MessageCellProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative">
      <MessageContent {...content} expandable={false} />

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute inset-0 cursor-pointer rounded-sm transition-colors hover:bg-[color-mix(in_srgb,var(--color-foreground)_5%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
      >
        <span className="sr-only">Details zur Nachricht anzeigen</span>
      </button>

      {/* Erst beim Öffnen einhängen – sonst stünden pro Seite 50 Dialoge im Baum. */}
      {open && <MessageDetailDialog messageId={messageId} open={open} onOpenChange={setOpen} />}
    </div>
  );
}

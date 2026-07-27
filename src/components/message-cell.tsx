"use client";

import * as React from "react";
import { DetailTrigger } from "@/components/detail-trigger";
import { MessageContent } from "@/components/message-content";
import { MessageDetailDialog } from "@/components/message-detail-dialog";

type MessageContentProps = React.ComponentProps<typeof MessageContent>;

interface MessageCellProps extends Omit<MessageContentProps, "overflow"> {
  messageId: string;
}

/**
 * Nachrichtenzelle, die sich anklicken lässt und den Detaildialog öffnet.
 *
 * Der „Mehr anzeigen“-Umschalter entfällt hier – seine Aufgabe übernimmt
 * der Dialog, und in einer Schaltfläche wäre er ohnehin nicht bedienbar.
 */
export function MessageCell({ messageId, ...content }: MessageCellProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <DetailTrigger label="Details zur Nachricht anzeigen" onOpen={() => setOpen(true)}>
      <MessageContent {...content} overflow="clamped" />

      {/* Erst beim Öffnen einhängen – sonst stünden pro Seite 50 Dialoge im Baum. */}
      {open && <MessageDetailDialog messageId={messageId} open={open} onOpenChange={setOpen} />}
    </DetailTrigger>
  );
}

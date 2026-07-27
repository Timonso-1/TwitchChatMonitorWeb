"use client";

import * as React from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { DetailButton } from "@/components/detail-trigger";
import { ModerationBadge } from "@/components/twitch-badges";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ModerationListItem } from "@/lib/queries/twitch";
import { formatDuration } from "@/lib/twitch";
import { formatDateTime } from "@/lib/utils";

/**
 * Eine Moderationsaktion in voller Länge.
 *
 * Wie beim Event trägt die Zeile bereits alles – Grund und gelöschter
 * Nachrichtentext sind in den Tabellen nur abgeschnitten, nicht unvollständig.
 */
export function ModerationDetailDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: ModerationListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-5">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <ModerationBadge action={entry.action} />
          </DialogTitle>
          <DialogDescription className="text-xs">
            {entry.channelName} · {formatDateTime(entry.occurredAt)}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-xs text-[var(--color-muted-foreground)]">Betroffen</dt>
          <dd>
            {entry.targetUserId ? (
              <Link href={`/viewers/${entry.targetUserId}`} className="font-medium hover:underline">
                {entry.targetUserName ?? entry.targetUserId}
              </Link>
            ) : (
              (entry.targetUserName ?? "—")
            )}
          </dd>

          <dt className="text-xs text-[var(--color-muted-foreground)]">Dauer</dt>
          <dd>{formatDuration(entry.durationSeconds)}</dd>

          <dt className="text-xs text-[var(--color-muted-foreground)]">Grund</dt>
          <dd className="whitespace-pre-wrap break-words">{entry.reason ?? "Kein Grund angegeben"}</dd>
        </dl>

        {entry.deletedMessageContent && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--color-subtle)]">
              <Trash2 className="size-3" />
              Gelöschte Nachricht
            </p>
            <p className="whitespace-pre-wrap break-words rounded-lg border border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_8%,transparent)] p-4 text-[0.9375rem] leading-relaxed">
              {entry.deletedMessageContent}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Schaltfläche am Zeilenende, die den Dialog öffnet.
 *
 * Bewusst eine eigene Spalte statt einer anklickbaren Textzelle: Grund und
 * gelöschter Nachrichtentext sind bei Banns und Timeouts oft leer, und ein
 * „—“ ist kein erkennbares Ziel.
 */
export function ModerationDetailButton({ entry }: { entry: ModerationListItem }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <DetailButton label="Details zur Moderationsaktion anzeigen" onOpen={() => setOpen(true)} />
      {open && <ModerationDetailDialog entry={entry} open={open} onOpenChange={setOpen} />}
    </>
  );
}

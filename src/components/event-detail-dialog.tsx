"use client";

import * as React from "react";
import Link from "next/link";
import { DetailButton } from "@/components/detail-trigger";
import { EventBadge, SubTierBadge } from "@/components/twitch-badges";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EventListItem } from "@/lib/queries/twitch";
import { eventDetailText } from "@/lib/twitch";
import { formatDateTime, formatNumber } from "@/lib/utils";

/**
 * Ein Event in voller Länge.
 *
 * Anders als bei Nachrichten muss nichts nachgeladen werden: die Zeile
 * trägt bereits alle Angaben, es gibt weder Antwortkette noch Löschstatus.
 * Der Dialog bekommt den Eintrag deshalb als Prop.
 */
export function EventDetailDialog({
  event,
  open,
  onOpenChange,
}: {
  event: EventListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const facts: Array<[string, string]> = [];
  if (event.months !== null) facts.push(["Monate", formatNumber(event.months)]);
  if (event.giftCount !== null) facts.push(["Geschenkte Abos", formatNumber(event.giftCount)]);
  if (event.viewerCount !== null) facts.push(["Zuschauer", formatNumber(event.viewerCount)]);
  if (event.giftedByName) facts.push(["Geschenkt von", event.giftedByName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-5">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <EventBadge type={event.eventType} />
            <SubTierBadge tier={event.subTier} />
          </DialogTitle>
          <DialogDescription className="text-xs">
            {event.channelName} · {formatDateTime(event.occurredAt)}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
          <dt className="text-xs text-[var(--color-muted-foreground)]">Nutzer</dt>
          <dd>
            {event.userId ? (
              <Link href={`/viewers/${event.userId}`} className="font-medium hover:underline">
                {event.userName ?? event.userId}
              </Link>
            ) : (
              (event.userName ?? "—")
            )}
          </dd>

          <dt className="text-xs text-[var(--color-muted-foreground)]">Zusammenfassung</dt>
          <dd>
            {eventDetailText({
              months: event.months,
              giftCount: event.giftCount,
              viewerCount: event.viewerCount,
              giftedByName: event.giftedByName,
            }) || "—"}
          </dd>

          {facts.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt className="text-xs text-[var(--color-muted-foreground)]">{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </React.Fragment>
          ))}
        </dl>

        {event.message && (
          <div className="space-y-2">
            <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--color-subtle)]">
              Nachricht
            </p>
            <p className="whitespace-pre-wrap break-words rounded-lg bg-[var(--color-surface)] p-4 text-[0.9375rem] leading-relaxed ring-inset-subtle">
              {event.message}
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
 * Wie bei der Moderation eine eigene Spalte: die Nachrichtenspalte ist bei
 * Raids und den meisten Cheers leer und taugt nicht als Ziel.
 */
export function EventDetailButton({ event }: { event: EventListItem }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <DetailButton label="Details zum Event anzeigen" onOpen={() => setOpen(true)} />
      {open && <EventDetailDialog event={event} open={open} onOpenChange={setOpen} />}
    </>
  );
}

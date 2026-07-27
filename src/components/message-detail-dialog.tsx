"use client";

import * as React from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { MessagesSquare, Trash2 } from "lucide-react";
import { ChatBadges } from "@/components/chat-badges";
import { ChatName } from "@/components/chat-name";
import { MessageContent } from "@/components/message-content";
import { ViewerAvatar } from "@/components/viewer-avatar";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toBadgeSet, type MessageDetailPayload } from "@/lib/message-detail";
import { chatColorPair } from "@/lib/twitch";
import { cn, formatDateTime } from "@/lib/utils";
import { severityStyle } from "@/lib/watchlist";

/**
 * Volle Nachricht mit allen Details.
 *
 * Der Auslöser übergibt nur die messageId; alles Weitere wird beim Öffnen
 * nachgeladen. So bleibt die Tabellenzeile frei von Detaildaten und der
 * Nachrichten-Tab eine Server-Komponente.
 */
export function MessageDetailDialog({
  messageId,
  open,
  onOpenChange,
}: {
  messageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = React.useState<MessageDetailPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;

    const controller = new AbortController();

    setLoading(true);
    setError(null);
    setDetail(null);

    void (async () => {
      try {
        const response = await fetch(`/api/messages/detail?messageId=${encodeURIComponent(messageId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          setError(
            response.status === 404
              ? "Diese Nachricht ist nicht mehr vorhanden."
              : response.status === 403
                ? "Keine Berechtigung für diese Nachricht."
                : "Details konnten nicht geladen werden.",
          );
          return;
        }

        setDetail((await response.json()) as MessageDetailPayload);
      } catch (cause) {
        // Ein Abbruch beim Schliessen ist kein Fehler.
        if (cause instanceof Error && cause.name === "AbortError") return;
        setError("Details konnten nicht geladen werden.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [open, messageId]);

  const message = detail?.message;
  const name = message ? (message.displayName ?? message.userName) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-5">
        <DialogHeader className="flex-row items-center gap-3 space-y-0">
          <ViewerAvatar
            name={name ?? "?"}
            imageUrl={message?.avatar?.profileImageUrl}
            color={message?.color}
            size="md"
          />

          <div className="min-w-0 space-y-0.5">
            <DialogTitle className="flex flex-wrap items-center gap-1.5">
              {message ? (
                <>
                  <ChatBadges
                    badges={message.badges}
                    badgeInfo={message.badgeInfo}
                    set={toBadgeSet(message.badgeImages)}
                    isBroadcaster={message.isBroadcaster}
                    isMod={message.isMod}
                    isVip={message.isVip}
                    isSubscriber={message.isSubscriber}
                  />
                  <Link href={`/viewers/${message.userId}`} className="hover:underline">
                    <ChatName color={message.color}>{name}</ChatName>
                  </Link>
                </>
              ) : (
                "Nachricht"
              )}
            </DialogTitle>

            <DialogDescription className="text-xs">
              {message
                ? `${message.channelName} · ${formatDateTime(message.receivedAt)}`
                : "Details werden geladen…"}
            </DialogDescription>
          </div>
        </DialogHeader>

        {loading && <DetailSkeleton />}

        {error && <Alert variant="destructive">{error}</Alert>}

        {detail && message && (
          <div className="space-y-5">
            <Quote color={message.color}>
              <MessageContent
                content={message.content}
                emotes={message.emotes}
                badgeInfo={message.badgeInfo}
                isAction={message.isAction}
                bits={message.bits}
                isFirstMessage={message.isFirstMessage}
                isDeleted={detail.deletion !== null}
                matches={message.matches}
                showEmoteImages
                overflow="full"
              />
            </Quote>

            {message.matches.length > 0 && <MatchList matches={message.matches} />}

            {detail.deletion && <DeletionNote deletion={detail.deletion} />}

            {detail.conversation.length > 1 && (
              <Conversation entries={detail.conversation} currentId={message.messageId} />
            )}

            <TechnicalIds
              messageId={message.messageId}
              userId={message.userId}
              channelId={message.channelId}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Die Nachricht als Zitat, links begrenzt von der Chatfarbe ihres Autors.
 *
 * Die Farbe ist echte Twitch-Angabe und macht jeden Dialog seinem Sprecher
 * zuordenbar, statt eine beliebige Akzentfarbe zu setzen. Ohne hinterlegte
 * Farbe erbt die Leiste die Randfarbe.
 */
function Quote({ color, children }: { color: string | null; children: React.ReactNode }) {
  const pair = chatColorPair(color);

  return (
    <div className="flex gap-3.5 rounded-lg bg-[var(--color-surface)] p-4 ring-inset-subtle">
      <span
        aria-hidden
        className={cn("w-0.5 shrink-0 self-stretch rounded-full", pair ? "chat-name bg-current" : "bg-[var(--color-border-strong)]")}
        style={pair ? ({ "--chat-color-dark": pair.dark, "--chat-color-light": pair.light } as CSSProperties) : undefined}
      />

      <div className="min-w-0 flex-1 text-[0.9375rem] leading-relaxed">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--color-subtle)]">
      {children}
    </p>
  );
}

function MatchList({ matches }: { matches: MessageDetailPayload["message"]["matches"] }) {
  return (
    <div className="space-y-2">
      <SectionLabel>Wortfilter</SectionLabel>
      <ul className="flex flex-wrap gap-1.5">
        {matches.map((match) => (
          <li key={`${match.termId}-${match.start}`}>
            <Badge variant={severityStyle(match.severity).badge}>
              {match.term} · {severityStyle(match.severity).label}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeletionNote({ deletion }: { deletion: NonNullable<MessageDetailPayload["deletion"]> }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_8%,transparent)] p-3">
      <Trash2 className="mt-0.5 size-4 shrink-0 text-[var(--color-destructive)]" />
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="font-medium">Von der Moderation entfernt</p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {formatDateTime(deletion.occurredAt)}
          {deletion.reason ? ` · ${deletion.reason}` : " · kein Grund angegeben"}
        </p>
      </div>
    </div>
  );
}

function Conversation({
  entries,
  currentId,
}: {
  entries: MessageDetailPayload["conversation"];
  currentId: string;
}) {
  return (
    <div className="space-y-2">
      <SectionLabel>
        <span className="inline-flex items-center gap-1.5">
          <MessagesSquare className="size-3" />
          Unterhaltung · {entries.length} Nachrichten
        </span>
      </SectionLabel>

      <ol className="space-y-px overflow-hidden rounded-lg border border-[var(--color-border)]">
        {entries.map((entry) => {
          const current = entry.messageId === currentId;

          return (
            <li
              key={entry.messageId}
              className={cn(
                "px-3 py-2 text-sm",
                current
                  ? "bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)]"
                  : "bg-[var(--color-surface)]",
              )}
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <ChatName color={entry.color} className="text-xs font-medium">
                  {entry.displayName ?? entry.userName}
                </ChatName>
                {entry.isRoot && <Badge variant="outline">Ursprung</Badge>}
                {current && <Badge variant="primary">Diese Nachricht</Badge>}
                <span className="ml-auto text-[0.6875rem] text-[var(--color-subtle)]">
                  {formatDateTime(entry.receivedAt)}
                </span>
              </div>
              <p className="mt-1 break-words">{entry.content}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Technische Kennungen – selten gebraucht, deshalb zugeklappt. */
function TechnicalIds({
  messageId,
  userId,
  channelId,
}: {
  messageId: string;
  userId: string;
  channelId: string;
}) {
  return (
    <details className="group border-t border-[var(--color-border)] pt-3">
      <summary className="cursor-pointer list-none text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--color-subtle)] transition-colors hover:text-[var(--color-muted-foreground)]">
        Technische Angaben
        <span className="ml-1.5 font-normal normal-case tracking-normal group-open:hidden">anzeigen</span>
      </summary>

      <dl className="mt-2.5 grid gap-x-4 gap-y-1 sm:grid-cols-[6rem_1fr]">
        <dt className="text-xs text-[var(--color-muted-foreground)]">Nachricht</dt>
        <dd className="break-all text-meta-mono">{messageId}</dd>
        <dt className="text-xs text-[var(--color-muted-foreground)]">Nutzer</dt>
        <dd className="break-all text-meta-mono">{userId}</dd>
        <dt className="text-xs text-[var(--color-muted-foreground)]">Channel</dt>
        <dd className="break-all text-meta-mono">{channelId}</dd>
      </dl>
    </details>
  );
}

/** Platzhalter in der Form des Ergebnisses – ruhiger als ein Ladetext. */
function DetailSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="space-y-2 rounded-lg bg-[var(--color-surface)] p-4">
        <div className="h-3.5 w-full animate-pulse rounded bg-[var(--color-muted)]" />
        <div className="h-3.5 w-4/5 animate-pulse rounded bg-[var(--color-muted)]" />
        <div className="h-3.5 w-2/5 animate-pulse rounded bg-[var(--color-muted)]" />
      </div>
      <div className="h-3 w-24 animate-pulse rounded bg-[var(--color-muted)]" />
    </div>
  );
}

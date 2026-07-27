"use client";

import * as React from "react";
import Link from "next/link";
import { CornerDownRight, Trash2 } from "lucide-react";
import { ChatBadges } from "@/components/chat-badges";
import { ChatName } from "@/components/chat-name";
import { MessageContent } from "@/components/message-content";
import { ViewerAvatar } from "@/components/viewer-avatar";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toBadgeSet, type MessageDetailPayload } from "@/lib/message-detail";
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {message ? `${message.channelName} · ${formatDateTime(message.receivedAt)}` : "Nachricht"}
          </DialogTitle>
          <DialogDescription>{name ?? "Details werden geladen…"}</DialogDescription>
        </DialogHeader>

        {loading && <p className="text-sm text-[var(--color-muted-foreground)]">Details werden geladen…</p>}

        {error && <Alert variant="destructive">{error}</Alert>}

        {detail && message && (
          <div className="space-y-4">
            {/* Nutzerblock */}
            <div className="flex items-start gap-3 border-b border-[var(--color-border)] pb-4">
              <ViewerAvatar
                name={name ?? message.userName}
                imageUrl={message.avatar?.profileImageUrl}
                color={message.color}
                size="lg"
              />

              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
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
                    <ChatName color={message.color} className="font-medium">
                      {name}
                    </ChatName>
                  </Link>
                </div>

                <p className="text-xs text-[var(--color-muted-foreground)]">
                  {message.userName}
                  {message.color && <span className="ml-2 font-mono">{message.color}</span>}
                </p>
              </div>
            </div>

            {/* Volltext */}
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
              expandable={false}
            />

            {message.matches.length > 0 && <MatchList matches={message.matches} />}

            {detail.deletion && (
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium">
                  <Trash2 className="size-3.5 text-[var(--color-destructive)]" />
                  Von der Moderation entfernt
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                  {formatDateTime(detail.deletion.occurredAt)}
                  {detail.deletion.reason ? ` · ${detail.deletion.reason}` : ""}
                </p>
              </div>
            )}

            {detail.conversation.length > 1 && (
              <Conversation entries={detail.conversation} currentId={message.messageId} />
            )}

            <dl className="grid gap-x-4 gap-y-1.5 border-t border-[var(--color-border)] pt-4 text-xs sm:grid-cols-[7rem_1fr]">
              <dt className="text-[var(--color-muted-foreground)]">Nachricht</dt>
              <dd className="break-all font-mono">{message.messageId}</dd>
              <dt className="text-[var(--color-muted-foreground)]">Nutzer</dt>
              <dd className="break-all font-mono">{message.userId}</dd>
              <dt className="text-[var(--color-muted-foreground)]">Channel</dt>
              <dd className="break-all font-mono">{message.channelId}</dd>
            </dl>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MatchList({ matches }: { matches: MessageDetailPayload["message"]["matches"] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-[var(--color-muted-foreground)]">Wortfilter-Treffer</p>
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

function Conversation({
  entries,
  currentId,
}: {
  entries: MessageDetailPayload["conversation"];
  currentId: string;
}) {
  return (
    <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
      <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
        <CornerDownRight className="size-3" />
        Unterhaltung ({entries.length} Nachrichten)
      </p>

      <ol className="space-y-1.5">
        {entries.map((entry) => (
          <li
            key={entry.messageId}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-sm",
              entry.messageId === currentId
                ? "bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--color-brand)_30%,transparent)]"
                : "bg-[var(--color-surface)]",
            )}
          >
            <div className="flex flex-wrap items-baseline gap-x-2">
              <ChatName color={entry.color} className="text-xs font-medium">
                {entry.displayName ?? entry.userName}
              </ChatName>
              {entry.isRoot && <Badge variant="outline">Ursprung</Badge>}
              <span className="text-[0.65rem] text-[var(--color-subtle)]">
                {formatDateTime(entry.receivedAt)}
              </span>
            </div>
            <p className="mt-0.5 break-words">{entry.content}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

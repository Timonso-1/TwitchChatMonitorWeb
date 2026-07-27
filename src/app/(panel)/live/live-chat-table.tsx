"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { ChatBadges } from "@/components/chat-badges";
import { ChatName } from "@/components/chat-name";
import { MessageContent } from "@/components/message-content";
import { ViewerAvatar } from "@/components/viewer-avatar";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FeedState, LiveMessage } from "@/lib/live-chat-feed";
import { cn, formatDateTime } from "@/lib/utils";
import { highestSeverity, severityStyle } from "@/lib/watchlist";

interface LiveChatTableProps {
  /** Bereits gefilterte Liste – der Trefferfilter liegt beim Container. */
  messages: LiveMessage[];
  feed: FeedState;
  emptyLabel: string;
}

/** Zeileneinfärbung nach der höchsten Wortfilterstufe der Nachricht. */
const ROW_TINT: Record<string, string> = {
  critical:
    "bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-destructive)_16%,transparent)]",
  warning:
    "bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)]",
  info: "bg-[color-mix(in_srgb,var(--color-info)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-info)_14%,transparent)]",
};

const ICON_TINT: Record<string, string> = {
  critical: "text-[var(--color-destructive)]",
  warning: "text-[var(--color-warning)]",
  info: "text-[var(--color-info)]",
};

export function LiveChatTable({ messages, feed, emptyLabel }: LiveChatTableProps) {
  return (
    <Table>
      <TableHeader className="sticky top-0 z-10 bg-[var(--color-card)]">
        <TableRow>
          <TableHead className="w-40">Zeit</TableHead>
          <TableHead className="w-32">Channel</TableHead>
          <TableHead className="w-48">Nutzer</TableHead>
          <TableHead>Nachricht</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {messages.length === 0 ? (
          <TableEmpty colSpan={4} title={emptyLabel} />
        ) : (
          messages.map((message) => {
            const severity = highestSeverity(message.matches);
            const avatar = feed.avatars.get(message.userId);
            const name = message.displayName ?? message.userName;

            return (
              <TableRow key={message.id} className={severity ? ROW_TINT[severity] : undefined}>
                <TableCell className="whitespace-nowrap text-meta">{formatDateTime(message.receivedAt)}</TableCell>

                <TableCell className="text-meta">{message.channelName}</TableCell>

                <TableCell>
                  <div className="flex items-center gap-2">
                    <ViewerAvatar
                      name={name}
                      imageUrl={avatar?.profileImageUrl}
                      color={message.color}
                      size="sm"
                    />

                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                      <ChatBadges
                        badges={message.badges}
                        badgeInfo={message.badgeInfo}
                        set={feed.badgeSets.get(message.channelId)}
                        isBroadcaster={message.isBroadcaster}
                        isMod={message.isMod}
                        isVip={message.isVip}
                        isSubscriber={message.isSubscriber}
                      />
                      <Link href={`/viewers/${message.userId}`} className="max-w-28 truncate hover:underline">
                        <ChatName color={message.color} className="font-medium">
                          {name}
                        </ChatName>
                      </Link>
                    </div>
                  </div>
                </TableCell>

                <TableCell className="max-w-xl">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <MessageContent
                        content={message.content}
                        badgeInfo={message.badgeInfo}
                        isAction={message.isAction}
                        bits={message.bits}
                        isFirstMessage={message.isFirstMessage}
                        isDeleted={feed.deletedIds.has(message.messageId)}
                        replyTo={
                          message.replyToMessageId
                            ? (feed.replyTargets.get(message.replyToMessageId) ?? null)
                            : null
                        }
                        matches={message.matches}
                      />
                    </div>

                    {severity && (
                      <AlertTriangle
                        className={cn("mt-0.5 size-3.5 shrink-0", ICON_TINT[severity])}
                        aria-label={`Wortfilter: ${severityStyle(severity).label}`}
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

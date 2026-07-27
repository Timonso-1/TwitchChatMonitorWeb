"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDown, Filter, Pause, Play, Radio, Trash2 } from "lucide-react";
import { ChatName } from "@/components/chat-name";
import { HighlightedMessage } from "@/components/highlighted-message";
import { ChatRoleBadges } from "@/components/twitch-badges";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn, formatNumber } from "@/lib/utils";
import { highestSeverity, severityStyle, type TermMatch } from "@/lib/watchlist";

interface LiveMessage {
  id: number;
  channelUuid: string;
  channelName: string;
  userId: string;
  userName: string;
  displayName: string | null;
  color: string | null;
  content: string;
  bits: number;
  isMod: boolean;
  isSubscriber: boolean;
  isVip: boolean;
  isBroadcaster: boolean;
  isFirstMessage: boolean;
  isAction: boolean;
  receivedAt: string;
  matches: TermMatch[];
}

interface LiveChatProps {
  channels: Array<{ uuid: string; name: string }>;
  /** Vorausgewählter Channel aus der URL. */
  initialChannel?: string;
}

const REFRESH_OPTIONS = [
  { value: 2000, label: "2 Sekunden" },
  { value: 5000, label: "5 Sekunden" },
  { value: 15000, label: "15 Sekunden" },
];

/** Mehr Nachrichten braucht niemand im Blick – ältere werden verworfen. */
const MAX_MESSAGES = 300;

export function LiveChat({ channels, initialChannel }: LiveChatProps) {
  const [channel, setChannel] = React.useState(initialChannel ?? "");
  const [interval, setIntervalMs] = React.useState(5000);
  const [paused, setPaused] = React.useState(false);
  const [onlyHits, setOnlyHits] = React.useState(false);
  const [messages, setMessages] = React.useState<LiveMessage[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  const [newCount, setNewCount] = React.useState(0);

  const latestId = React.useRef(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  /** Verhindert, dass sich zwei Abrufe überlappen und dieselben Nachrichten doppelt liefern. */
  const inFlight = React.useRef(false);
  /** Als Ref, damit ein Scrollwechsel nicht die Abrufschleife neu aufsetzt. */
  const atBottomRef = React.useRef(true);

  React.useEffect(() => {
    atBottomRef.current = atBottom;
  }, [atBottom]);

  // Bei Channelwechsel von vorn beginnen.
  React.useEffect(() => {
    latestId.current = 0;
    setMessages([]);
    setNewCount(0);
  }, [channel]);

  const fetchMessages = React.useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;

    try {
      const params = new URLSearchParams();
      if (channel) params.set("channel", channel);
      params.set("after", String(latestId.current));

      const response = await fetch(`/api/live-chat?${params.toString()}`, { cache: "no-store" });

      if (!response.ok) {
        setError(response.status === 403 ? "Keine Berechtigung für den Live-Chat." : "Verbindung fehlgeschlagen.");
        return;
      }

      const data = (await response.json()) as { messages: LiveMessage[]; latestId: number };
      setError(null);

      if (data.messages.length === 0) return;

      latestId.current = Math.max(latestId.current, data.latestId);

      setMessages((previous) => {
        // Zweite Absicherung: bereits vorhandene IDs überspringen.
        const known = new Set(previous.map((message) => message.id));
        const fresh = data.messages.filter((message) => !known.has(message.id));

        if (fresh.length === 0) return previous;

        if (!atBottomRef.current) setNewCount((count) => count + fresh.length);

        const merged = [...previous, ...fresh];
        return merged.length > MAX_MESSAGES ? merged.slice(merged.length - MAX_MESSAGES) : merged;
      });
    } catch {
      setError("Verbindung fehlgeschlagen.");
    } finally {
      inFlight.current = false;
    }
  }, [channel]);

  // Abrufschleife
  React.useEffect(() => {
    void fetchMessages();
    if (paused) return;

    const timer = window.setInterval(() => void fetchMessages(), interval);
    return () => window.clearInterval(timer);
  }, [fetchMessages, interval, paused]);

  // Automatisch nach unten scrollen, solange der Nutzer dort steht.
  React.useEffect(() => {
    if (!atBottom || paused) return;
    const container = containerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages, atBottom, paused]);

  function onScroll(event: React.UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const bottom = distance < 60;

    setAtBottom(bottom);
    if (bottom) setNewCount(0);
  }

  function scrollToBottom() {
    const container = containerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
    setAtBottom(true);
    setNewCount(0);
  }

  const visible = onlyHits ? messages.filter((message) => message.matches.length > 0) : messages;
  const hitCount = messages.filter((message) => message.matches.length > 0).length;

  return (
    <div className="space-y-3">
      {/* Steuerleiste */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3.5 ring-inset-subtle">
        <div className="w-full space-y-1.5 sm:w-52">
          <span className="block text-xs font-medium text-[var(--color-muted-foreground)]">Channel</span>
          <Select value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="">Alle Channels</option>
            {channels.map((entry) => (
              <option key={entry.uuid} value={entry.uuid}>
                {entry.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-full space-y-1.5 sm:w-40">
          <span className="block text-xs font-medium text-[var(--color-muted-foreground)]">Aktualisierung</span>
          <Select value={interval} onChange={(event) => setIntervalMs(Number(event.target.value))}>
            {REFRESH_OPTIONS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant={paused ? "default" : "outline"} size="sm" onClick={() => setPaused((value) => !value)}>
            {paused ? <Play /> : <Pause />}
            {paused ? "Fortsetzen" : "Pause"}
          </Button>

          <Button variant="outline" size="sm" onClick={() => setMessages([])}>
            <Trash2 />
            Leeren
          </Button>
        </div>

        <Button
          type="button"
          variant={onlyHits ? "default" : "outline"}
          size="sm"
          onClick={() => setOnlyHits((value) => !value)}
          aria-pressed={onlyHits}
        >
          <Filter />
          Nur Wortfilter-Treffer
          {hitCount > 0 && <Badge variant="warning">{formatNumber(hitCount)}</Badge>}
        </Button>

        <span className="ml-auto flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
          <span
            className={cn(
              "size-2 rounded-full",
              paused ? "bg-[var(--color-subtle)]" : "animate-pulse bg-[var(--color-success)]",
            )}
          />
          {paused ? "Pausiert" : "Live"}
          <span className="text-[var(--color-subtle)]">· {formatNumber(messages.length)} im Puffer</span>
        </span>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {/* Nachrichtenstrom */}
      <div className="relative">
        <div
          ref={containerRef}
          onScroll={onScroll}
          className="h-[60vh] overflow-y-auto scrollbar-thin rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3 ring-inset-subtle"
        >
          {visible.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]">
              <Radio className="size-5 opacity-50" />
              {onlyHits ? "Noch keine Treffer." : "Warte auf Nachrichten…"}
            </div>
          ) : (
            <ol className="space-y-1">
              {visible.map((message) => {
                const severity = highestSeverity(message.matches);

                return (
                  <li
                    key={message.id}
                    className={cn(
                      "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded px-2 py-1 text-sm",
                      severity === "critical" &&
                        "bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)]",
                      severity === "warning" &&
                        "bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)]",
                      severity === "info" && "bg-[color-mix(in_srgb,var(--color-info)_8%,transparent)]",
                    )}
                  >
                    <span className="shrink-0 font-mono text-xs text-[var(--color-subtle)]">
                      {new Date(message.receivedAt).toLocaleTimeString("de-DE", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>

                    {!channel && (
                      <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">
                        {message.channelName}
                      </span>
                    )}

                    <span className="flex shrink-0 items-center gap-1">
                      <ChatRoleBadges
                        isBroadcaster={message.isBroadcaster}
                        isMod={message.isMod}
                        isVip={message.isVip}
                        isSubscriber={message.isSubscriber}
                      />
                      <Link href={`/viewers/${message.userId}`} className="hover:underline">
                        <ChatName color={message.color} className="font-medium">
                          {message.displayName ?? message.userName}
                        </ChatName>
                      </Link>
                      <span className="text-[var(--color-subtle)]">:</span>
                    </span>

                    <span className="min-w-0 flex-1 break-words">
                      <HighlightedMessage
                        content={message.content}
                        matches={message.matches}
                        isAction={message.isAction}
                      />
                      {message.bits > 0 && (
                        <Badge variant="success" className="ml-1.5">
                          {formatNumber(message.bits)} Bits
                        </Badge>
                      )}
                      {message.isFirstMessage && (
                        <Badge variant="warning" className="ml-1.5">
                          Erste Nachricht
                        </Badge>
                      )}
                    </span>

                    {severity && (
                      <AlertTriangle
                        className={cn(
                          "size-3.5 shrink-0",
                          severity === "critical"
                            ? "text-[var(--color-destructive)]"
                            : severity === "warning"
                              ? "text-[var(--color-warning)]"
                              : "text-[var(--color-info)]",
                        )}
                        aria-label={`Wortfilter: ${severityStyle(severity).label}`}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Sprungknopf, wenn während des Lesens neue Nachrichten kamen */}
        {!atBottom && (
          <Button
            size="sm"
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-overlay"
          >
            <ArrowDown />
            {newCount > 0 ? `${formatNumber(newCount)} neue Nachrichten` : "Nach unten"}
          </Button>
        )}
      </div>
    </div>
  );
}

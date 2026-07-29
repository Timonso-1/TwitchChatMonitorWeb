"use client";

import * as React from "react";
import { ArrowDown, Filter, Pause, Play, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { ChannelFilterOption } from "@/lib/channel-filter";
import { emptyFeedState, mergeBatch, type LiveChatPayload } from "@/lib/live-chat-feed";
import { cn, formatNumber } from "@/lib/utils";
import { LiveChatTable } from "./live-chat-table";

interface LiveChatProps {
  channels: ChannelFilterOption[];
  /** Vorausgewählte Twitch-ID aus der URL, bereits normalisiert. */
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
  const [feed, setFeed] = React.useState(emptyFeedState);
  const [error, setError] = React.useState<string | null>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  const [newCount, setNewCount] = React.useState(0);

  const latestId = React.useRef(0);
  /** Zweiter Cursor: trägt Löschungen nach, die nach dem Eintreffen passieren. */
  const modCursor = React.useRef(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  /** Verhindert, dass sich zwei Abrufe überlappen und dieselben Nachrichten doppelt liefern. */
  const inFlight = React.useRef(false);
  /** Als Ref, damit ein Scrollwechsel nicht die Abrufschleife neu aufsetzt. */
  const atBottomRef = React.useRef(true);

  React.useEffect(() => {
    atBottomRef.current = atBottom;
  }, [atBottom]);

  // Bei Channelwechsel von vorn beginnen. Beide Cursor zurück auf 0, damit
  // wieder der Erstabruf-Pfad greift; die Wörterbücher bleiben als Cache.
  React.useEffect(() => {
    latestId.current = 0;
    modCursor.current = 0;
    setFeed(emptyFeedState());
    setNewCount(0);
  }, [channel]);

  const fetchMessages = React.useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;

    try {
      const params = new URLSearchParams();

      // Gefiltert wird über channel_uuid; die Auswahl trägt die Twitch-ID, die
      // auf mehrere UUIDs zeigen kann (Channel geloescht und neu angelegt).
      const selected = channels.find((entry) => entry.twitchId === channel);
      if (selected) params.set("channel", selected.uuids.join(","));
      params.set("after", String(latestId.current));
      params.set("modAfter", String(modCursor.current));

      const response = await fetch(`/api/live-chat?${params.toString()}`, { cache: "no-store" });

      if (!response.ok) {
        setError(response.status === 403 ? "Keine Berechtigung für den Live-Chat." : "Verbindung fehlgeschlagen.");
        return;
      }

      const payload = (await response.json()) as LiveChatPayload;
      setError(null);

      latestId.current = Math.max(latestId.current, payload.latestId);
      modCursor.current = Math.max(modCursor.current, payload.modCursor);

      setFeed((previous) => {
        const { state, added } = mergeBatch(previous, payload, MAX_MESSAGES);
        if (added > 0 && !atBottomRef.current) setNewCount((count) => count + added);
        return state;
      });
    } catch {
      setError("Verbindung fehlgeschlagen.");
    } finally {
      inFlight.current = false;
    }
  }, [channel, channels]);

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
  }, [feed, atBottom, paused]);

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

  const visible = onlyHits ? feed.messages.filter((message) => message.matches.length > 0) : feed.messages;
  const hitCount = feed.messages.filter((message) => message.matches.length > 0).length;

  return (
    <div className="space-y-3">
      {/* Steuerleiste */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3.5 ring-inset-subtle">
        <div className="w-full space-y-1.5 sm:w-52">
          <span className="block text-xs font-medium text-[var(--color-muted-foreground)]">Channel</span>
          <Select value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option value="">Alle Channels</option>
            {channels.map((entry) => (
              <option key={entry.twitchId} value={entry.twitchId}>
                {entry.label}
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

          <Button variant="outline" size="sm" onClick={() => setFeed(emptyFeedState())}>
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
          <span className="text-[var(--color-subtle)]">· {formatNumber(feed.messages.length)} im Puffer</span>
        </span>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {/* Nachrichtenstrom */}
      <div className="relative">
        <div
          ref={containerRef}
          onScroll={onScroll}
          className="h-[60vh] overflow-y-auto scrollbar-thin rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] ring-inset-subtle"
        >
          <LiveChatTable
            messages={visible}
            feed={feed}
            emptyLabel={onlyHits ? "Noch keine Treffer." : "Warte auf Nachrichten…"}
          />
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

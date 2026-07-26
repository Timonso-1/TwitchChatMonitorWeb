"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare, Radio, Search, Users } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface CommandEntry {
  href: string;
  label: string;
  group: string;
}

interface SearchResult {
  type: "viewer" | "channel";
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

interface CommandPaletteProps {
  entries: CommandEntry[];
  /** Darf der Nutzer die Nachrichtensuche öffnen? */
  canSearchMessages?: boolean;
}

/**
 * Befehlspalette (Strg/⌘ + K): Navigation und globale Suche.
 * Seiten werden lokal gefiltert, Chatter und Channels serverseitig gesucht.
 */
export function CommandPalette({ entries, canSearchMessages }: CommandPaletteProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((previous) => !previous);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Serverseitige Suche mit kurzer Verzögerung, damit nicht jeder Tastendruck eine Anfrage auslöst.
  React.useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (response.ok) {
          const data = (await response.json()) as { results: SearchResult[] };
          setResults(data.results);
        }
      } catch {
        // Abgebrochene Anfragen sind hier normal.
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const pages = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;

    return entries.filter(
      (entry) => entry.label.toLowerCase().includes(needle) || entry.group.toLowerCase().includes(needle),
    );
  }, [entries, query]);

  // Alle auswählbaren Einträge in Anzeigereihenfolge – Grundlage für die Pfeiltasten.
  const flat = React.useMemo(() => {
    const items: Array<{ href: string; label: string; hint: string }> = [
      ...pages.map((entry) => ({ href: entry.href, label: entry.label, hint: entry.group })),
      ...results.map((entry) => ({
        href: entry.href,
        label: entry.label,
        hint: entry.sublabel ?? (entry.type === "viewer" ? "Zuschauer" : "Channel"),
      })),
    ];

    if (canSearchMessages && query.trim().length >= 2) {
      items.push({
        href: `/messages?content=${encodeURIComponent(query.trim())}`,
        label: `Nachrichten nach „${query.trim()}“ durchsuchen`,
        hint: "Volltextsuche",
      });
    }

    return items;
  }, [pages, results, canSearchMessages, query]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, flat.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = flat[activeIndex];
      if (target) go(target.href);
    }
  }

  let runningIndex = -1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-8 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] pl-2.5 pr-2 text-xs",
          "text-[var(--color-subtle)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-muted-foreground)]",
        )}
      >
        <Search className="size-3.5" />
        <span className="hidden sm:inline">Suchen…</span>
        <kbd className="ml-2 hidden rounded border border-[var(--color-border)] px-1 py-0.5 font-mono text-[0.6rem] sm:inline">
          Strg K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-24 max-w-lg -translate-y-0 gap-0 p-0" showClose={false}>
          <DialogTitle className="sr-only">Suchen</DialogTitle>

          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3">
            <Search className="size-4 shrink-0 text-[var(--color-subtle)]" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Seite, Chatter oder Channel suchen…"
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-subtle)]"
            />
            {loading && <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--color-subtle)]" />}
          </div>

          <div className="max-h-96 overflow-y-auto scrollbar-thin p-1.5">
            {flat.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-[var(--color-muted-foreground)]">
                {query.trim().length < 2 ? "Mindestens zwei Zeichen eingeben." : `Keine Treffer für „${query}“.`}
              </p>
            ) : (
              <>
                {pages.length > 0 && (
                  <>
                    <p className="px-2.5 py-1 text-xs font-medium text-[var(--color-subtle)]">Seiten</p>
                    {pages.map((entry) => {
                      runningIndex++;
                      const index = runningIndex;

                      return (
                        <PaletteItem
                          key={entry.href}
                          active={index === activeIndex}
                          label={entry.label}
                          hint={entry.group}
                          onSelect={() => go(entry.href)}
                          onHover={() => setActiveIndex(index)}
                        />
                      );
                    })}
                  </>
                )}

                {results.length > 0 && (
                  <>
                    <p className="px-2.5 pb-1 pt-2 text-xs font-medium text-[var(--color-subtle)]">Treffer</p>
                    {results.map((entry) => {
                      runningIndex++;
                      const index = runningIndex;
                      const Icon = entry.type === "viewer" ? Users : Radio;

                      return (
                        <PaletteItem
                          key={`${entry.type}-${entry.id}`}
                          active={index === activeIndex}
                          label={entry.label}
                          hint={entry.sublabel}
                          icon={<Icon className="size-3.5 shrink-0 opacity-60" />}
                          onSelect={() => go(entry.href)}
                          onHover={() => setActiveIndex(index)}
                        />
                      );
                    })}
                  </>
                )}

                {canSearchMessages && query.trim().length >= 2 && (
                  <>
                    <p className="px-2.5 pb-1 pt-2 text-xs font-medium text-[var(--color-subtle)]">Volltext</p>
                    {(() => {
                      runningIndex++;
                      const index = runningIndex;

                      return (
                        <PaletteItem
                          active={index === activeIndex}
                          label={`Nachrichten nach „${query.trim()}“ durchsuchen`}
                          icon={<MessageSquare className="size-3.5 shrink-0 opacity-60" />}
                          onSelect={() => go(`/messages?content=${encodeURIComponent(query.trim())}`)}
                          onHover={() => setActiveIndex(index)}
                        />
                      );
                    })()}
                  </>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PaletteItem({
  active,
  label,
  hint,
  icon,
  onSelect,
  onHover,
}: {
  active: boolean;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onHover}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        active ? "bg-[var(--color-accent)] text-[var(--color-foreground)]" : "text-[var(--color-muted-foreground)]",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      {hint && <span className="shrink-0 text-xs text-[var(--color-subtle)]">{hint}</span>}
    </button>
  );
}

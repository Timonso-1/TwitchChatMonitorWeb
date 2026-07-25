"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface CommandEntry {
  href: string;
  label: string;
  group: string;
}

/**
 * Schlanke Befehlspalette (Strg/⌘ + K) fuer die Navigation.
 * Bewusst ohne zusaetzliche Abhaengigkeit umgesetzt.
 */
export function CommandPalette({ entries }: { entries: CommandEntry[] }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
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

  const results = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;

    return entries.filter(
      (entry) => entry.label.toLowerCase().includes(needle) || entry.group.toLowerCase().includes(needle),
    );
  }, [entries, query]);

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
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = results[activeIndex];
      if (target) go(target.href);
    }
  }

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
        <span className="hidden sm:inline">Seite suchen…</span>
        <kbd className="ml-2 hidden rounded border border-[var(--color-border)] px-1 py-0.5 font-mono text-[0.6rem] sm:inline">
          Strg K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-24 max-w-lg -translate-y-0 gap-0 p-0" showClose={false}>
          <DialogTitle className="sr-only">Seite suchen</DialogTitle>

          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3">
            <Search className="size-4 shrink-0 text-[var(--color-subtle)]" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Seite suchen…"
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-subtle)]"
            />
          </div>

          <div className="max-h-80 overflow-y-auto scrollbar-thin p-1.5">
            {results.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-[var(--color-muted-foreground)]">
                Keine Treffer für „{query}“.
              </p>
            ) : (
              results.map((entry, index) => (
                <button
                  key={entry.href}
                  type="button"
                  onClick={() => go(entry.href)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    index === activeIndex
                      ? "bg-[var(--color-accent)] text-[var(--color-foreground)]"
                      : "text-[var(--color-muted-foreground)]",
                  )}
                >
                  <span className="truncate">{entry.label}</span>
                  <span className="shrink-0 text-xs text-[var(--color-subtle)]">{entry.group}</span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

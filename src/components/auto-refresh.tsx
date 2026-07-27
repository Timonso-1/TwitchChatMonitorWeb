"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Automatische Aktualisierung serverseitig gerenderter Seiten.
 *
 * `router.refresh()` lässt Next.js die Server Components neu rendern –
 * damit werden alle Datenbankabfragen der Seite erneut ausgeführt und
 * Kennzahlen, Tabellen und Diagramme sind wieder aktuell. Der bestehende
 * Scrollzustand und Formulareingaben bleiben dabei erhalten.
 *
 * Bewusst standardmäßig AUS: jede Aktualisierung kostet einen kompletten
 * Satz Datenbankabfragen. Wer sie braucht, schaltet sie gezielt ein.
 */

const INTERVALS = [
  { value: 10_000, label: "10 s" },
  { value: 30_000, label: "30 s" },
  { value: 60_000, label: "1 min" },
  { value: 300_000, label: "5 min" },
] as const;

/** Merkt sich die Wahl pro Seite, damit sie beim Blättern erhalten bleibt. */
const STORAGE_KEY = "tp_auto_refresh";

interface AutoRefreshProps {
  /** Vorgewähltes Intervall in Millisekunden. */
  defaultInterval?: number;
  /** Kompakte Darstellung ohne Intervallauswahl. */
  compact?: boolean;
  className?: string;
}

export function AutoRefresh({ defaultInterval = 30_000, compact, className }: AutoRefreshProps) {
  const router = useRouter();

  const [enabled, setEnabled] = React.useState(false);
  const [interval, setIntervalMs] = React.useState(defaultInterval);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastRefresh, setLastRefresh] = React.useState<Date | null>(null);

  // Gespeicherte Einstellung übernehmen.
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const parsed = JSON.parse(stored) as { enabled?: boolean; interval?: number };
      if (typeof parsed.enabled === "boolean") setEnabled(parsed.enabled);
      if (typeof parsed.interval === "number") setIntervalMs(parsed.interval);
    } catch {
      // Ohne localStorage bleibt es bei den Vorgaben.
    }
  }, []);

  function persist(next: { enabled?: boolean; interval?: number }) {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ enabled: next.enabled ?? enabled, interval: next.interval ?? interval }),
      );
    } catch {
      // Speichern ist optional.
    }
  }

  const refresh = React.useCallback(() => {
    setRefreshing(true);
    router.refresh();

    // Next.js meldet nicht, wann der Refresh fertig ist –
    // die kurze Anzeige dient nur als Rückmeldung.
    window.setTimeout(() => {
      setRefreshing(false);
      setLastRefresh(new Date());
    }, 600);
  }, [router]);

  React.useEffect(() => {
    if (!enabled) return;

    // Im Hintergrundtab nicht aktualisieren – spart Abfragen.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, interval);

    return () => window.clearInterval(timer);
  }, [enabled, interval, refresh]);

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-0.5",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          const next = !enabled;
          setEnabled(next);
          persist({ enabled: next });
          if (next) refresh();
        }}
        title={enabled ? "Automatische Aktualisierung pausieren" : "Automatisch aktualisieren"}
        className={cn("h-7 gap-1.5 px-2", enabled && "text-[var(--color-success)]")}
      >
        {enabled ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        <span className="hidden sm:inline">{enabled ? "Live" : "Auto"}</span>
        {enabled && <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-success)]" />}
      </Button>

      {!compact && enabled && (
        <select
          value={interval}
          onChange={(event) => {
            const next = Number(event.target.value);
            setIntervalMs(next);
            persist({ interval: next });
          }}
          aria-label="Aktualisierungsintervall"
          className="h-7 rounded-[5px] bg-transparent px-1 text-xs text-[var(--color-muted-foreground)] outline-none"
        >
          {INTERVALS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      )}

      <Button
        variant="ghost"
        size="icon"
        onClick={refresh}
        disabled={refreshing}
        title={
          lastRefresh
            ? `Zuletzt aktualisiert: ${lastRefresh.toLocaleTimeString("de-DE")}`
            : "Jetzt aktualisieren"
        }
        className="size-7"
      >
        <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        <span className="sr-only">Jetzt aktualisieren</span>
      </Button>
    </div>
  );
}

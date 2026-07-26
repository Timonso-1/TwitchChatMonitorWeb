"use client";

import * as React from "react";
import { MessageSquare, Radio, Users } from "lucide-react";
import { cn, formatCompact, formatNumber, formatRelative } from "@/lib/utils";

interface StatusData {
  channelsActive: number;
  messagesTotal: number;
  messages24h: number;
  viewersTotal: number;
  lastMessageAt: string | null;
  live: boolean;
  activity: Array<{ hour: string; messages: number }>;
}

const REFRESH_MS = 20_000;

/**
 * Erfassungsstand auf der Anmeldeseite, aktualisiert sich selbst.
 *
 * Bewusst leicht gehalten: die Karte soll das Anmeldeformular ergänzen,
 * nicht mit ihm um Aufmerksamkeit konkurrieren.
 */
export function LoginStatus({ initial }: { initial: StatusData | null }) {
  const [data, setData] = React.useState<StatusData | null>(initial);

  React.useEffect(() => {
    let active = true;

    async function load() {
      if (document.visibilityState !== "visible") return;

      try {
        const response = await fetch("/api/public-status", { cache: "no-store" });
        if (!response.ok) return;

        const next = (await response.json()) as StatusData;
        if (active) setData(next);
      } catch {
        // Stillschweigend – die Anmeldung funktioniert auch ohne Kennzahlen.
      }
    }

    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!data) return null;

  const peak = Math.max(...data.activity.map((point) => point.messages), 1);

  return (
    <div className="mt-5 space-y-4">
      {/* Betriebszustand */}
      <div className="flex items-center justify-center gap-2 text-xs">
        <span className="relative flex size-1.5">
          {data.live && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-success)] opacity-75" />
          )}
          <span
            className={cn(
              "relative inline-flex size-1.5 rounded-full",
              data.live ? "bg-[var(--color-success)]" : "bg-[var(--color-subtle)]",
            )}
          />
        </span>

        <span className="text-[var(--color-muted-foreground)]">
          {data.live ? "Erfassung aktiv" : "Keine aktuelle Aktivität"}
        </span>

        {data.lastMessageAt && (
          <>
            <span className="text-[var(--color-border-strong)]">·</span>
            <span className="text-[var(--color-subtle)]">{formatRelative(data.lastMessageAt)}</span>
          </>
        )}
      </div>

      {/* Nachrichtenaufkommen der letzten 24 Stunden */}
      {data.activity.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex h-10 items-end gap-[3px]" aria-hidden>
            {data.activity.map((point, index) => {
              const height = point.messages === 0 ? 3 : Math.max(12, (point.messages / peak) * 100);
              // Jüngere Stunden kräftiger – der Blick wandert nach rechts.
              const strength = 0.35 + (index / Math.max(1, data.activity.length - 1)) * 0.65;

              return (
                <span
                  key={point.hour}
                  title={`${new Date(point.hour).toLocaleTimeString("de-DE", { hour: "2-digit" })} Uhr · ${formatNumber(point.messages)}`}
                  className="flex-1 rounded-sm transition-[height] duration-700 ease-out"
                  style={{
                    height: `${height}%`,
                    backgroundColor:
                      point.messages === 0
                        ? "var(--color-border)"
                        : `color-mix(in srgb, var(--color-foreground) ${Math.round(strength * 55)}%, transparent)`,
                  }}
                />
              );
            })}
          </div>

          <p className="text-center text-[0.7rem] text-[var(--color-subtle)]">
            <span className="tabular-nums text-[var(--color-muted-foreground)]">
              {formatNumber(data.messages24h)}
            </span>{" "}
            Nachrichten in 24 Stunden
          </p>
        </div>
      )}

      {/* Kennzahlen */}
      <dl className="grid grid-cols-3 gap-2">
        <Metric icon={Radio} label="Channels" value={formatNumber(data.channelsActive)} />
        <Metric
          icon={MessageSquare}
          label="Nachrichten"
          value={formatCompact(data.messagesTotal)}
          title={`${formatNumber(data.messagesTotal)} insgesamt`}
        />
        <Metric
          icon={Users}
          label="Zuschauer"
          value={formatCompact(data.viewersTotal)}
          title={`${formatNumber(data.viewersTotal)} bekannt`}
        />
      </dl>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  title,
}: {
  icon: typeof Radio;
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="flex flex-col items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)]/60 px-2 py-2.5 backdrop-blur-sm transition-colors hover:border-[var(--color-border-strong)]"
    >
      <Icon className="size-3.5 text-[var(--color-subtle)]" />
      <dd className="text-sm font-semibold tabular-nums leading-none">{value}</dd>
      <dt className="text-[0.65rem] text-[var(--color-subtle)]">{label}</dt>
    </div>
  );
}

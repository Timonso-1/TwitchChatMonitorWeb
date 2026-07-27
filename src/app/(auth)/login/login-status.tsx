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
 * Rechte Split-Fläche: Live-Signal, Activity und Kennzahlen als visuelle Anker.
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
    <div className="mx-auto w-full max-w-lg space-y-10">
      {/* Betriebszustand */}
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-2.5">
            {data.live && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-success)] opacity-60 motion-reduce:animate-none" />
            )}
            <span
              className={cn(
                "relative inline-flex size-2.5 rounded-full",
                data.live ? "bg-[var(--color-success)]" : "bg-[var(--color-subtle)]",
              )}
            />
          </span>

          <p className="text-sm font-medium tracking-tight text-[var(--color-foreground)]">
            {data.live ? "Erfassung aktiv" : "Keine aktuelle Aktivität"}
          </p>
        </div>

        {data.lastMessageAt && (
          <p className="pl-5 text-xs text-[var(--color-subtle)]">
            Letzte Nachricht {formatRelative(data.lastMessageAt)}
          </p>
        )}
      </div>

      {/* Nachrichtenaufkommen der letzten 24 Stunden */}
      {data.activity.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium text-[var(--color-muted-foreground)]">Aktivität · 24 Stunden</p>
            <p className="text-xs tabular-nums text-[var(--color-subtle)]">
              <span className="font-medium text-[var(--color-foreground)]">
                {formatNumber(data.messages24h)}
              </span>{" "}
              Nachrichten
            </p>
          </div>

          <div className="flex h-40 items-end gap-[3px]" aria-hidden>
            {data.activity.map((point, index) => {
              const height = point.messages === 0 ? 4 : Math.max(10, (point.messages / peak) * 100);
              // Jüngere Stunden kräftiger – der Blick wandert nach rechts.
              const strength = 0.3 + (index / Math.max(1, data.activity.length - 1)) * 0.7;
              const brandMix = Math.round(18 + strength * 42);

              return (
                <span
                  key={point.hour}
                  title={`${new Date(point.hour).toLocaleTimeString("de-DE", { hour: "2-digit" })} Uhr · ${formatNumber(point.messages)}`}
                  className="flex-1 rounded-sm transition-[height] duration-700 ease-out motion-reduce:transition-none"
                  style={{
                    height: `${height}%`,
                    backgroundColor:
                      point.messages === 0
                        ? "var(--color-border)"
                        : `color-mix(in srgb, var(--color-brand) ${brandMix}%, var(--color-foreground))`,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Kennzahlen */}
      <dl className="grid grid-cols-3 gap-6 border-t border-[var(--color-border)] pt-8">
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
    <div title={title} className="min-w-0 space-y-2">
      <dt className="flex items-center gap-1.5 text-[0.7rem] text-[var(--color-subtle)]">
        <Icon className="size-3.5 shrink-0" />
        {label}
      </dt>
      <dd className="truncate text-2xl font-semibold tracking-tight tabular-nums leading-none">{value}</dd>
    </div>
  );
}

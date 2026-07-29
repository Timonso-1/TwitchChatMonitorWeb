"use client";

/**
 * Kurzlebige Rückmeldungen für Aktionen, die keinen eigenen Platz auf der Seite
 * haben – vor allem die Aktionen in den Zeilen-Dropdowns.
 *
 * Formulare und Dialoge nutzen das bewusst nicht: dort steht die Meldung besser
 * neben dem Feld, auf das sie sich bezieht. Hier geht es nur um die Fälle, in
 * denen sonst gar keine Rückmeldung erschiene.
 */

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import type { ActionState } from "@/lib/actions/types";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "destructive" | "info" | "warning";

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  /** Anzeigedauer in Millisekunden; 0 blendet nicht automatisch aus. */
  duration?: number;
}

interface ToastEntry extends Required<Omit<ToastOptions, "duration">> {
  id: number;
  duration: number;
}

/** Fehler bleiben länger stehen – sie erfordern eine Reaktion. */
const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  destructive: 8000,
};

const ICONS: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  destructive: XCircle,
};

const ICON_COLORS: Record<ToastVariant, string> = {
  success: "text-[var(--color-success)]",
  info: "text-[var(--color-info)]",
  warning: "text-[var(--color-warning)]",
  destructive: "text-[var(--color-destructive)]",
};

const BORDERS: Record<ToastVariant, string> = {
  success: "border-[color-mix(in_srgb,var(--color-success)_35%,transparent)]",
  info: "border-[color-mix(in_srgb,var(--color-info)_35%,transparent)]",
  warning: "border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)]",
  destructive: "border-[color-mix(in_srgb,var(--color-destructive)_40%,transparent)]",
};

type ToastFn = (options: ToastOptions) => void;

const ToastContext = React.createContext<ToastFn | null>(null);

/**
 * Liefert die Funktion zum Anzeigen einer Meldung.
 *
 * Ausserhalb des Providers wird bewusst nicht geworfen: eine fehlende
 * Rückmeldung darf keine Seite lahmlegen. Stattdessen landet die Meldung in der
 * Konsole, damit der Fehler beim Entwickeln auffällt.
 */
export function useToast(): ToastFn {
  const context = React.useContext(ToastContext);

  return React.useMemo(
    () =>
      context ??
      ((options: ToastOptions) => {
        console.warn("[toast] ausserhalb des ToastProvider:", options.message);
      }),
    [context],
  );
}

/**
 * Meldet das Ergebnis einer Server Action als Toast und ruft bei Erfolg den
 * übergebenen Rückruf auf – üblicherweise `router.refresh()`.
 *
 * Greift bei jedem Ergebnis, weil `useActionState` pro Aufruf ein neues Objekt
 * liefert; der Ausgangszustand `idle` löst nichts aus.
 */
export function useActionToast(
  state: ActionState,
  onSuccess?: () => void,
  /** `showErrors: false`, wenn ein Dialog den Fehler bereits inline anzeigt. */
  options: { showErrors?: boolean } = {},
): void {
  const toast = useToast();
  const showErrors = options.showErrors ?? true;

  // Als Ref, damit ein neu erzeugter Rückruf den Effekt nicht erneut auslöst
  // und dieselbe Meldung ein zweites Mal anzeigt.
  const onSuccessRef = React.useRef(onSuccess);
  React.useEffect(() => {
    onSuccessRef.current = onSuccess;
  });

  React.useEffect(() => {
    if (state.status === "idle") return;

    if (state.message && (state.status === "success" || showErrors)) {
      toast({ message: state.message, variant: state.status === "success" ? "success" : "destructive" });
    }

    if (state.status === "success") onSuccessRef.current?.();
  }, [state, toast, showErrors]);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = React.useState<ToastEntry[]>([]);

  const dismiss = React.useCallback((id: number) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = React.useCallback<ToastFn>((options) => {
    const variant = options.variant ?? "info";

    setEntries((current) => [
      ...current,
      {
        id: nextId++,
        message: options.message,
        variant,
        duration: options.duration ?? DEFAULT_DURATION[variant],
      },
    ]);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastViewport entries={entries} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ entries, onDismiss }: { entries: ToastEntry[]; onDismiss: (id: number) => void }) {
  return (
    // aria-live meldet neue Einträge vor, ohne den Fokus zu stehlen.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {entries.map((entry) => (
        <ToastItem key={entry.id} entry={entry} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ entry, onDismiss }: { entry: ToastEntry; onDismiss: (id: number) => void }) {
  const Icon = ICONS[entry.variant];

  React.useEffect(() => {
    if (entry.duration <= 0) return;

    const timer = window.setTimeout(() => onDismiss(entry.id), entry.duration);
    return () => window.clearTimeout(timer);
  }, [entry.id, entry.duration, onDismiss]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-start gap-2.5 rounded-md border bg-[var(--color-popover)] px-3.5 py-2.5 text-sm shadow-lg",
        BORDERS[entry.variant],
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", ICON_COLORS[entry.variant])} aria-hidden />
      <p className="min-w-0 flex-1 leading-relaxed">{entry.message}</p>

      <button
        type="button"
        onClick={() => onDismiss(entry.id)}
        className="-mr-1 -mt-0.5 rounded p-1 text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-foreground)]"
      >
        <X className="size-3.5" />
        <span className="sr-only">Meldung schließen</span>
      </button>
    </div>
  );
}

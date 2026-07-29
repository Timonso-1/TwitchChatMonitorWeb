"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { HighlightedMessage } from "@/components/highlighted-message";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { createWatchTermAction, updateWatchTermAction } from "@/lib/actions/watchlist";
import { IDLE_STATE } from "@/lib/actions/types";
import { MATCH_TYPES, TERM_SEVERITIES, type TermMatch } from "@/lib/watchlist";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

/** Antwort von /api/watchlist/preview – receivedAt kommt als ISO-Zeichenkette. */
interface WatchTermPreviewPayload {
  scanned: number;
  hits: number;
  samples: Array<{
    messageId: string;
    channelName: string;
    userName: string;
    displayName: string | null;
    content: string;
    receivedAt: string;
    matches: TermMatch[];
  }>;
}

export interface WatchTermFormData {
  id: number;
  term: string;
  matchType: string;
  severity: string;
  caseSensitive: boolean;
  active: boolean;
  note: string | null;
  channelUuid: string | null;
}

interface WatchTermDialogProps {
  mode: "create" | "edit";
  term?: WatchTermFormData;
  channels: Array<{ uuid: string; name: string }>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

export function WatchTermDialog({
  mode,
  term,
  channels,
  open: controlledOpen,
  onOpenChange,
  hideTrigger,
}: WatchTermDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [state, formAction] = useActionState(
    mode === "create" ? createWatchTermAction : updateWatchTermAction,
    IDLE_STATE,
  );
  const router = useRouter();

  const [matchType, setMatchType] = useState(term?.matchType ?? "contains");

  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<WatchTermPreviewPayload | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "success") {
      setOpen(false);
      router.refresh();
    }
  }, [state, setOpen, router]);

  // Beim Schliessen zuruecksetzen, damit ein spaeter geoeffneter Dialog nicht
  // das Ergebnis eines anderen Begriffs zeigt.
  useEffect(() => {
    if (!open) {
      setPreview(null);
      setPreviewError(null);
    }
  }, [open]);

  /**
   * Liest die aktuellen Formularwerte und laesst den Begriff probelaufen.
   *
   * Über FormData statt über State: die Felder sind unkontrolliert, und ein
   * Umbau auf kontrollierte Eingaben nur für den Probelauf waere unverhaeltnismaessig.
   */
  async function runPreview() {
    const form = formRef.current;
    if (!form) return;

    const data = new FormData(form);
    const term = String(data.get("term") ?? "").trim();

    if (!term) {
      setPreviewError("Erst einen Begriff eingeben.");
      setPreview(null);
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const response = await fetch("/api/watchlist/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term,
          matchType: String(data.get("matchType") ?? "contains"),
          caseSensitive: data.get("caseSensitive") === "on",
          channelUuid: String(data.get("channelUuid") ?? "") || null,
        }),
      });

      if (!response.ok) {
        setPreviewError(response.status === 403 ? "Keine Berechtigung." : "Probelauf fehlgeschlagen.");
        setPreview(null);
        return;
      }

      setPreview((await response.json()) as WatchTermPreviewPayload);
    } catch {
      setPreviewError("Probelauf fehlgeschlagen.");
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  const hint = MATCH_TYPES.find((entry) => entry.value === matchType)?.hint;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus />
            Begriff hinzufügen
          </Button>
        </DialogTrigger>
      )}

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Begriff hinzufügen" : "Begriff bearbeiten"}</DialogTitle>
          <DialogDescription>
            Passende Nachrichten werden im Panel hervorgehoben und in der Trefferliste gesammelt.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-4">
          {term && <input type="hidden" name="id" value={term.id} />}

          {state.status === "error" && state.message && <Alert variant="destructive">{state.message}</Alert>}

          <div className="space-y-1.5">
            <Label htmlFor="wt-term">Begriff</Label>
            <Input
              id="wt-term"
              name="term"
              defaultValue={term?.term ?? ""}
              required
              maxLength={255}
              autoFocus
              className="font-mono"
              placeholder={matchType === "regex" ? "z\\.B\\.\\s+muster" : "z. B. discord.gg"}
            />
            {state.fieldErrors?.term?.map((error) => (
              <p key={error} className="text-xs text-[var(--color-destructive)]">
                {error}
              </p>
            ))}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
              <button
                type="button"
                onClick={runPreview}
                disabled={previewLoading}
                className="text-xs font-medium text-[var(--color-muted-foreground)] underline-offset-2 transition-colors hover:text-[var(--color-foreground)] hover:underline disabled:opacity-50"
              >
                {previewLoading ? "Prüfe…" : "Gegen letzte Nachrichten testen"}
              </button>

              {previewError && <span className="text-xs text-[var(--color-destructive)]">{previewError}</span>}
            </div>

            {preview && <PreviewResult preview={preview} />}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wt-matchType">Trefferart</Label>
              <Select
                id="wt-matchType"
                name="matchType"
                defaultValue={term?.matchType ?? "contains"}
                onChange={(event) => setMatchType(event.target.value)}
              >
                {MATCH_TYPES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
              {hint && <p className="text-xs text-[var(--color-subtle)]">{hint}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wt-severity">Stufe</Label>
              <Select id="wt-severity" name="severity" defaultValue={term?.severity ?? "warning"}>
                {TERM_SEVERITIES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wt-channel">Nur in diesem Channel</Label>
            <Select id="wt-channel" name="channelUuid" defaultValue={term?.channelUuid ?? ""}>
              <option value="">Alle Channels</option>
              {channels.map((channel) => (
                <option key={channel.uuid} value={channel.uuid}>
                  {channel.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wt-note">Notiz (optional)</Label>
            <Input
              id="wt-note"
              name="note"
              defaultValue={term?.note ?? ""}
              maxLength={255}
              placeholder="Warum wird das beobachtet?"
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="caseSensitive"
                defaultChecked={term?.caseSensitive ?? false}
                className="size-4 accent-[var(--color-brand)]"
              />
              Groß-/Kleinschreibung beachten
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="active"
                defaultChecked={term?.active ?? true}
                className="size-4 accent-[var(--color-brand)]"
              />
              Aktiv
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <SubmitButton pendingLabel="Speichern…">{mode === "create" ? "Hinzufügen" : "Speichern"}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Ergebnis des Probelaufs.
 *
 * Die Trefferquote ist wichtiger als die Beispiele: Ein Muster, das fast jede
 * geprüfte Nachricht trifft, ist praktisch immer ein Versehen. Deshalb steht
 * sie oben und wird ab der Hälfte als Warnung eingefärbt.
 */
function PreviewResult({ preview }: { preview: WatchTermPreviewPayload }) {
  if (preview.scanned === 0) {
    return (
      <p className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
        Keine Nachrichten zum Prüfen gefunden.
      </p>
    );
  }

  const share = preview.hits / preview.scanned;
  const tooBroad = share >= 0.5;

  return (
    <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <p className={cn("text-xs", tooBroad ? "text-[var(--color-warning)]" : "text-[var(--color-muted-foreground)]")}>
        {preview.hits === 0
          ? `Kein Treffer in den letzten ${formatNumber(preview.scanned)} Nachrichten.`
          : `${formatNumber(preview.hits)} von ${formatNumber(preview.scanned)} geprüften Nachrichten treffen.`}
        {tooBroad && " Das Muster ist vermutlich zu weit gefasst."}
      </p>

      {preview.samples.length > 0 && (
        <ul className="space-y-1.5">
          {preview.samples.map((sample) => (
            <li key={sample.messageId} className="text-xs">
              <div className="flex flex-wrap items-baseline gap-x-2 text-[0.6875rem] text-[var(--color-subtle)]">
                <span className="font-medium text-[var(--color-muted-foreground)]">
                  {sample.displayName ?? sample.userName}
                </span>
                <span>{sample.channelName}</span>
                <span className="ml-auto">{formatDateTime(sample.receivedAt)}</span>
              </div>
              <p className="break-words">
                <HighlightedMessage content={sample.content} matches={sample.matches} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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
import { MATCH_TYPES, TERM_SEVERITIES } from "@/lib/watchlist";

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

  useEffect(() => {
    if (state.status === "success") {
      setOpen(false);
      router.refresh();
    }
  }, [state, setOpen, router]);

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

        <form action={formAction} className="space-y-4">
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

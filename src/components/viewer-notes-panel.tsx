"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Pin, Plus, Trash2, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  createViewerNoteAction,
  deleteViewerNoteAction,
  updateViewerNoteAction,
} from "@/lib/actions/viewer-notes";
import { IDLE_STATE } from "@/lib/actions/types";
import { NOTE_SEVERITIES, noteSeverityStyle } from "@/lib/notes";
import { cn, formatDateTime } from "@/lib/utils";

export interface ViewerNoteView {
  id: number;
  content: string;
  severity: string;
  pinned: boolean;
  authorName: string;
  isOwn: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ViewerNotesPanelProps {
  viewerUserId: string;
  notes: ViewerNoteView[];
  canWrite: boolean;
  canDeleteForeign: boolean;
}

export function ViewerNotesPanel({ viewerUserId, notes, canWrite, canDeleteForeign }: ViewerNotesPanelProps) {
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<number | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2">
          Notizen
          {notes.length > 0 && <Badge variant="muted">{notes.length}</Badge>}
        </CardTitle>

        {canWrite && !composerOpen && (
          <Button variant="ghost" size="sm" onClick={() => setComposerOpen(true)}>
            <Plus />
            Neu
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {canWrite && composerOpen && (
          <NoteComposer viewerUserId={viewerUserId} onDone={() => setComposerOpen(false)} />
        )}

        {notes.length === 0 && !composerOpen && (
          <p className="py-4 text-center text-sm text-[var(--color-muted-foreground)]">
            Noch keine Notizen zu diesem Zuschauer.
          </p>
        )}

        {notes.map((note) =>
          editingId === note.id ? (
            <NoteEditor key={note.id} note={note} onDone={() => setEditingId(null)} />
          ) : (
            <NoteCard
              key={note.id}
              note={note}
              canEdit={canWrite && (note.isOwn || canDeleteForeign)}
              canDelete={canWrite && (note.isOwn || canDeleteForeign)}
              onEdit={() => setEditingId(note.id)}
            />
          ),
        )}
      </CardContent>
    </Card>
  );
}

function NoteCard({
  note,
  canEdit,
  canDelete,
  onEdit,
}: {
  note: ViewerNoteView;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
}) {
  const [state, formAction] = React.useActionState(deleteViewerNoteAction, IDLE_STATE);
  const [confirming, setConfirming] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);

  const style = noteSeverityStyle(note.severity);
  const edited = note.updatedAt !== note.createdAt;

  return (
    <div className="relative overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
      <span className={cn("absolute inset-y-0 left-0 w-0.5", style.bar)} aria-hidden />

      <div className="space-y-2 py-3 pl-4 pr-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={style.badge}>{style.label}</Badge>
          {note.pinned && (
            <Badge variant="info">
              <Pin className="size-3" />
              Angeheftet
            </Badge>
          )}
          {note.isOwn && <Badge variant="outline">Eigene</Badge>}
        </div>

        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{note.content}</p>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-subtle)]">
          <span>
            {note.authorName} · {formatDateTime(note.createdAt)}
            {edited && " · bearbeitet"}
          </span>

          {(canEdit || canDelete) && (
            <span className="flex items-center gap-1">
              {canEdit && (
                <Button variant="ghost" size="icon" className="size-7" onClick={onEdit} aria-label="Notiz bearbeiten">
                  <Pencil className="size-3.5" />
                </Button>
              )}

              {canDelete &&
                (confirming ? (
                  <form action={formAction} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={note.id} />
                    <SubmitButton variant="destructive" size="sm" className="h-7 px-2" pendingLabel="…">
                      Löschen
                    </SubmitButton>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => setConfirming(false)}
                      aria-label="Abbrechen"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </form>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => setConfirming(true)}
                    aria-label="Notiz löschen"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ))}
            </span>
          )}
        </div>

        {state.status === "error" && state.message && (
          <Alert variant="destructive" hideIcon>
            {state.message}
          </Alert>
        )}
      </div>
    </div>
  );
}

function NoteComposer({ viewerUserId, onDone }: { viewerUserId: string; onDone: () => void }) {
  const [state, formAction] = React.useActionState(createViewerNoteAction, IDLE_STATE);
  const router = useRouter();

  React.useEffect(() => {
    if (state.status === "success") {
      onDone();
      router.refresh();
    }
  }, [state, onDone, router]);

  return (
    <form action={formAction} className="space-y-2.5 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3">
      <input type="hidden" name="viewerUserId" value={viewerUserId} />

      {state.status === "error" && state.message && (
        <Alert variant="destructive" hideIcon>
          {state.message}
        </Alert>
      )}

      <Textarea
        name="content"
        placeholder="Was sollte das Team über diesen Zuschauer wissen?"
        required
        maxLength={4000}
        autoFocus
        rows={4}
      />
      {state.fieldErrors?.content?.map((error) => (
        <p key={error} className="text-xs text-[var(--color-destructive)]">
          {error}
        </p>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Select name="severity" defaultValue="info" className="w-36">
          {NOTE_SEVERITIES.map((severity) => (
            <option key={severity.value} value={severity.value}>
              {severity.label}
            </option>
          ))}
        </Select>

        <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
          <input type="checkbox" name="pinned" className="size-3.5 accent-[var(--color-info)]" />
          Anheften
        </label>

        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Abbrechen
          </Button>
          <SubmitButton size="sm" pendingLabel="Speichern…">
            Speichern
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

function NoteEditor({ note, onDone }: { note: ViewerNoteView; onDone: () => void }) {
  const [state, formAction] = React.useActionState(updateViewerNoteAction, IDLE_STATE);
  const router = useRouter();

  React.useEffect(() => {
    if (state.status === "success") {
      onDone();
      router.refresh();
    }
  }, [state, onDone, router]);

  return (
    <form action={formAction} className="space-y-2.5 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3">
      <input type="hidden" name="id" value={note.id} />

      {state.status === "error" && state.message && (
        <Alert variant="destructive" hideIcon>
          {state.message}
        </Alert>
      )}

      <Textarea name="content" defaultValue={note.content} required maxLength={4000} autoFocus rows={4} />

      <div className="flex flex-wrap items-center gap-2">
        <Select name="severity" defaultValue={note.severity} className="w-36">
          {NOTE_SEVERITIES.map((severity) => (
            <option key={severity.value} value={severity.value}>
              {severity.label}
            </option>
          ))}
        </Select>

        <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
          <input
            type="checkbox"
            name="pinned"
            defaultChecked={note.pinned}
            className="size-3.5 accent-[var(--color-info)]"
          />
          Anheften
        </label>

        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Abbrechen
          </Button>
          <SubmitButton size="sm" pendingLabel="Speichern…">
            Speichern
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}

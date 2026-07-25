"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { AuthorizationError, assertPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { adminViewerNotes, viewers } from "@/lib/db/schema";
import { errorState, fromZodError, successState, type ActionState } from "./types";

async function guard(permission: Parameters<typeof assertPermission>[0]) {
  try {
    return { session: await assertPermission(permission), error: null as ActionState | null };
  } catch (error) {
    return {
      session: null,
      error: errorState(error instanceof AuthorizationError ? error.message : "Unerwarteter Fehler."),
    };
  }
}

const createSchema = z.object({
  viewerUserId: z.string().trim().min(1, "Zuschauer-ID fehlt.").max(32),
  content: z
    .string()
    .trim()
    .min(3, "Die Notiz ist zu kurz.")
    .max(4000, "Maximal 4000 Zeichen."),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  pinned: z.boolean().default(false),
});

export async function createViewerNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.VIEWERS_NOTES_WRITE);
  if (!session) return error!;

  const parsed = createSchema.safeParse({
    viewerUserId: formData.get("viewerUserId"),
    content: formData.get("content"),
    severity: formData.get("severity") ?? "info",
    pinned: formData.get("pinned") === "on" || formData.get("pinned") === "true",
  });

  if (!parsed.success) return fromZodError(parsed.error);

  const [viewer] = await db
    .select({ userName: viewers.userName })
    .from(viewers)
    .where(eq(viewers.userId, parsed.data.viewerUserId))
    .limit(1);

  if (!viewer) return errorState("Dieser Zuschauer ist nicht bekannt.");

  const now = new Date();

  await db.insert(adminViewerNotes).values({
    viewerUserId: parsed.data.viewerUserId,
    viewerUserName: viewer.userName,
    content: parsed.data.content,
    severity: parsed.data.severity,
    pinned: parsed.data.pinned,
    authorUuid: session.user.uuid,
    authorName: session.user.displayName ?? session.user.username,
    createdAt: now,
    updatedAt: now,
  });

  await writeAudit({
    action: AUDIT_ACTIONS.VIEWER_NOTE_CREATED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "viewer",
    targetId: parsed.data.viewerUserId,
    targetLabel: viewer.userName,
    metadata: { severity: parsed.data.severity, pinned: parsed.data.pinned },
  });

  revalidatePath(`/viewers/${parsed.data.viewerUserId}`);
  return successState("Notiz gespeichert.");
}

const updateSchema = createSchema.omit({ viewerUserId: true }).extend({
  id: z.coerce.number().int().positive("Ungültige Notiz-ID."),
});

/** Bearbeiten ist nur für die eigene Notiz erlaubt – oder mit Löschrecht. */
export async function updateViewerNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.VIEWERS_NOTES_WRITE);
  if (!session) return error!;

  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    content: formData.get("content"),
    severity: formData.get("severity") ?? "info",
    pinned: formData.get("pinned") === "on" || formData.get("pinned") === "true",
  });

  if (!parsed.success) return fromZodError(parsed.error);

  const [note] = await db.select().from(adminViewerNotes).where(eq(adminViewerNotes.id, parsed.data.id)).limit(1);
  if (!note) return errorState("Notiz wurde nicht gefunden.");

  const isOwnNote = note.authorUuid === session.user.uuid;
  const mayEditForeign =
    session.user.permissions.includes("*") ||
    session.user.permissions.includes(PERMISSIONS.VIEWERS_NOTES_DELETE);

  if (!isOwnNote && !mayEditForeign) {
    return errorState("Du kannst nur deine eigenen Notizen bearbeiten.");
  }

  await db
    .update(adminViewerNotes)
    .set({
      content: parsed.data.content,
      severity: parsed.data.severity,
      pinned: parsed.data.pinned,
      updatedAt: new Date(),
    })
    .where(eq(adminViewerNotes.id, parsed.data.id));

  await writeAudit({
    action: AUDIT_ACTIONS.VIEWER_NOTE_UPDATED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "viewer",
    targetId: note.viewerUserId,
    targetLabel: note.viewerUserName,
    metadata: { noteId: note.id, foreignNote: !isOwnNote },
  });

  revalidatePath(`/viewers/${note.viewerUserId}`);
  return successState("Notiz aktualisiert.");
}

export async function deleteViewerNoteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  // Eigene Notizen darf jeder mit Schreibrecht entfernen, fremde nur mit Löschrecht.
  const { session, error } = await guard(PERMISSIONS.VIEWERS_NOTES_WRITE);
  if (!session) return error!;

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return errorState("Ungültige Notiz-ID.");

  const [note] = await db.select().from(adminViewerNotes).where(eq(adminViewerNotes.id, id)).limit(1);
  if (!note) return errorState("Notiz wurde nicht gefunden.");

  const isOwnNote = note.authorUuid === session.user.uuid;
  const mayDeleteForeign =
    session.user.permissions.includes("*") ||
    session.user.permissions.includes(PERMISSIONS.VIEWERS_NOTES_DELETE);

  if (!isOwnNote && !mayDeleteForeign) {
    return errorState("Zum Löschen fremder Notizen fehlt dir die Berechtigung.");
  }

  await db.delete(adminViewerNotes).where(eq(adminViewerNotes.id, id));

  await writeAudit({
    action: AUDIT_ACTIONS.VIEWER_NOTE_DELETED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "viewer",
    targetId: note.viewerUserId,
    targetLabel: note.viewerUserName,
    metadata: { noteId: note.id, foreignNote: !isOwnNote, severity: note.severity },
    note: note.content.slice(0, 500),
  });

  revalidatePath(`/viewers/${note.viewerUserId}`);
  return successState("Notiz gelöscht.");
}

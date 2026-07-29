"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { AuthorizationError, assertPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { channels } from "@/lib/db/schema";
import { errorState, fromZodError, successState, type ActionState } from "./types";

/** Kapselt den Berechtigungscheck und liefert eine Fehler-ActionState statt zu werfen. */
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

const channelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name erforderlich.")
    .max(64, "Maximal 64 Zeichen.")
    .regex(/^[a-zA-Z0-9_]+$/, "Nur Buchstaben, Ziffern und Unterstriche erlaubt."),
  broadcasterId: z
    .string()
    .trim()
    .min(1, "Broadcaster-ID erforderlich.")
    .max(32, "Maximal 32 Zeichen.")
    .regex(/^\d+$/, "Die Broadcaster-ID besteht nur aus Ziffern."),
  active: z.coerce.boolean().default(true),
});

export async function createChannelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.CHANNELS_CREATE);
  if (!session) return error!;

  const parsed = channelSchema.safeParse({
    name: formData.get("name"),
    broadcasterId: formData.get("broadcasterId"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });

  if (!parsed.success) return fromZodError(parsed.error);

  const name = parsed.data.name.toLowerCase();

  const [existing] = await db
    .select({ uuid: channels.uuid })
    .from(channels)
    .where(eq(channels.broadcasterId, parsed.data.broadcasterId))
    .limit(1);

  if (existing) {
    return errorState("Zu dieser Broadcaster-ID existiert bereits ein Channel.", {
      broadcasterId: ["Broadcaster-ID bereits vergeben."],
    });
  }

  const now = new Date();
  const uuid = uuidv4();

  await db.insert(channels).values({
    uuid,
    broadcasterId: parsed.data.broadcasterId,
    name,
    active: parsed.data.active,
    createdAt: now,
    updatedAt: now,
    createdByUuid: session.user.uuid,
    createdByName: session.user.username,
  });

  await writeAudit({
    action: AUDIT_ACTIONS.CHANNEL_CREATED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "channel",
    targetId: uuid,
    targetLabel: name,
    metadata: { broadcasterId: parsed.data.broadcasterId, active: parsed.data.active },
  });

  revalidatePath("/channels");
  return successState(`Channel "${name}" wurde angelegt.`);
}

const updateSchema = channelSchema.extend({
  uuid: z.string().uuid("Ungültige Channel-ID."),
});

/**
 * MySQL 1451: eine andere Tabelle verweist noch per Fremdschlüssel auf die Zeile.
 * Sollte nach sql/008_drop_channel_fks.sql nicht mehr auftreten, faengt aber
 * spaeter wieder eingespielte Constraints ab, statt eine 500 zu werfen.
 */
function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "errno" in error &&
    (error as { errno?: unknown }).errno === 1451
  );
}

export async function updateChannelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.CHANNELS_UPDATE);
  if (!session) return error!;

  const parsed = updateSchema.safeParse({
    uuid: formData.get("uuid"),
    name: formData.get("name"),
    broadcasterId: formData.get("broadcasterId"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });

  if (!parsed.success) return fromZodError(parsed.error);

  const [current] = await db.select().from(channels).where(eq(channels.uuid, parsed.data.uuid)).limit(1);
  if (!current) return errorState("Channel wurde nicht gefunden.");

  const [conflict] = await db
    .select({ uuid: channels.uuid })
    .from(channels)
    .where(and(eq(channels.broadcasterId, parsed.data.broadcasterId), ne(channels.uuid, parsed.data.uuid)))
    .limit(1);

  if (conflict) {
    return errorState("Diese Broadcaster-ID gehört bereits zu einem anderen Channel.", {
      broadcasterId: ["Broadcaster-ID bereits vergeben."],
    });
  }

  const name = parsed.data.name.toLowerCase();

  await db
    .update(channels)
    .set({
      name,
      broadcasterId: parsed.data.broadcasterId,
      active: parsed.data.active,
      updatedAt: new Date(),
    })
    .where(eq(channels.uuid, parsed.data.uuid));

  await writeAudit({
    action: AUDIT_ACTIONS.CHANNEL_UPDATED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "channel",
    targetId: parsed.data.uuid,
    targetLabel: name,
    metadata: {
      before: { name: current.name, broadcasterId: current.broadcasterId, active: current.active },
      after: { name, broadcasterId: parsed.data.broadcasterId, active: parsed.data.active },
    },
  });

  revalidatePath("/channels");
  revalidatePath(`/channels/${parsed.data.uuid}`);
  return successState("Channel wurde aktualisiert.");
}

export async function deleteChannelAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.CHANNELS_DELETE);
  if (!session) return error!;

  const uuid = String(formData.get("uuid") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "").trim();

  const [channel] = await db.select().from(channels).where(eq(channels.uuid, uuid)).limit(1);
  if (!channel) return errorState("Channel wurde nicht gefunden.");

  if (confirmation.toLowerCase() !== channel.name.toLowerCase()) {
    return errorState("Zur Bestätigung bitte den Channel-Namen exakt eingeben.", {
      confirmation: ["Name stimmt nicht überein."],
    });
  }

  try {
    await db.delete(channels).where(eq(channels.uuid, uuid));
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;

    return errorState(
      "Der Channel kann nicht gelöscht werden, weil die Datenbank noch Fremdschlüssel auf ihn hält. " +
        "Bitte sql/008_drop_channel_fks.sql einspielen oder den Channel stattdessen deaktivieren.",
    );
  }

  await writeAudit({
    action: AUDIT_ACTIONS.CHANNEL_DELETED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "channel",
    targetId: uuid,
    targetLabel: channel.name,
    metadata: { broadcasterId: channel.broadcasterId },
    note: "Aufgezeichnete Nachrichten und Events bleiben erhalten.",
  });

  revalidatePath("/channels");
  return successState(`Channel "${channel.name}" wurde gelöscht.`);
}

/** Schneller Wechsel des Aktivstatus aus der Listenansicht. */
export async function toggleChannelActiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.CHANNELS_UPDATE);
  if (!session) return error!;

  const uuid = String(formData.get("uuid") ?? "");

  const [channel] = await db.select().from(channels).where(eq(channels.uuid, uuid)).limit(1);
  if (!channel) return errorState("Channel wurde nicht gefunden.");

  const nextActive = !channel.active;

  await db
    .update(channels)
    .set({ active: nextActive, updatedAt: new Date() })
    .where(eq(channels.uuid, uuid));

  await writeAudit({
    action: AUDIT_ACTIONS.CHANNEL_UPDATED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "channel",
    targetId: uuid,
    targetLabel: channel.name,
    metadata: { active: nextActive },
  });

  revalidatePath("/channels");
  return successState(nextActive ? "Channel aktiviert." : "Channel deaktiviert.");
}

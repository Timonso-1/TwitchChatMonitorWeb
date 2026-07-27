"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { AuthorizationError, assertPermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { adminWatchTerms } from "@/lib/db/schema";
import { buildTermPattern } from "@/lib/watchlist";
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

const termSchema = z.object({
  term: z.string().trim().min(2, "Mindestens 2 Zeichen.").max(255, "Maximal 255 Zeichen."),
  matchType: z.enum(["contains", "word", "regex"]).default("contains"),
  severity: z.enum(["info", "warning", "critical"]).default("warning"),
  caseSensitive: z.boolean().default(false),
  active: z.boolean().default(true),
  note: z.string().trim().max(255).optional().or(z.literal("")),
  channelUuid: z.string().trim().optional().or(z.literal("")),
});

function parseForm(formData: FormData) {
  return {
    term: formData.get("term"),
    matchType: formData.get("matchType") ?? "contains",
    severity: formData.get("severity") ?? "warning",
    caseSensitive: formData.get("caseSensitive") === "on" || formData.get("caseSensitive") === "true",
    active: formData.get("active") === "on" || formData.get("active") === "true",
    note: formData.get("note"),
    channelUuid: formData.get("channelUuid"),
  };
}

/** Prüft ein selbst geschriebenes Muster, bevor es gespeichert wird. */
function validatePattern(term: string, matchType: string): string | null {
  if (matchType !== "regex") return null;

  const pattern = buildTermPattern({
    id: 0,
    term,
    matchType,
    severity: "info",
    caseSensitive: false,
  });

  return pattern ? null : "Der reguläre Ausdruck ist ungültig.";
}

export async function createWatchTermAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.WATCHLIST_MANAGE);
  if (!session) return error!;

  const parsed = termSchema.safeParse(parseForm(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  const patternError = validatePattern(parsed.data.term, parsed.data.matchType);
  if (patternError) return errorState(patternError, { term: [patternError] });

  const channelUuid = parsed.data.channelUuid || null;

  const [existing] = await db
    .select({ id: adminWatchTerms.id })
    .from(adminWatchTerms)
    .where(
      and(
        eq(adminWatchTerms.term, parsed.data.term),
        eq(adminWatchTerms.matchType, parsed.data.matchType),
        channelUuid
          ? eq(adminWatchTerms.channelUuid, channelUuid)
          : eq(adminWatchTerms.matchType, parsed.data.matchType),
      ),
    )
    .limit(1);

  if (existing) {
    return errorState("Dieser Begriff ist bereits hinterlegt.", { term: ["Bereits vorhanden."] });
  }

  const now = new Date();

  await db.insert(adminWatchTerms).values({
    term: parsed.data.term,
    matchType: parsed.data.matchType,
    severity: parsed.data.severity,
    caseSensitive: parsed.data.caseSensitive,
    active: parsed.data.active,
    note: parsed.data.note || null,
    channelUuid,
    createdByUuid: session.user.uuid,
    createdByName: session.user.displayName ?? session.user.username,
    createdAt: now,
    updatedAt: now,
  });

  await writeAudit({
    action: AUDIT_ACTIONS.WATCH_TERM_CREATED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "watch_term",
    targetLabel: parsed.data.term,
    metadata: { matchType: parsed.data.matchType, severity: parsed.data.severity },
  });

  revalidatePath("/watchlist");
  return successState(`Begriff „${parsed.data.term}“ wurde hinzugefügt.`);
}

const updateSchema = termSchema.extend({
  id: z.coerce.number().int().positive("Ungültige ID."),
});

export async function updateWatchTermAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.WATCHLIST_MANAGE);
  if (!session) return error!;

  const parsed = updateSchema.safeParse({ ...parseForm(formData), id: formData.get("id") });
  if (!parsed.success) return fromZodError(parsed.error);

  const patternError = validatePattern(parsed.data.term, parsed.data.matchType);
  if (patternError) return errorState(patternError, { term: [patternError] });

  const [current] = await db.select().from(adminWatchTerms).where(eq(adminWatchTerms.id, parsed.data.id)).limit(1);
  if (!current) return errorState("Begriff wurde nicht gefunden.");

  const [conflict] = await db
    .select({ id: adminWatchTerms.id })
    .from(adminWatchTerms)
    .where(
      and(
        eq(adminWatchTerms.term, parsed.data.term),
        eq(adminWatchTerms.matchType, parsed.data.matchType),
        ne(adminWatchTerms.id, parsed.data.id),
      ),
    )
    .limit(1);

  if (conflict) {
    return errorState("Ein Begriff mit diesem Text und dieser Trefferart existiert bereits.");
  }

  await db
    .update(adminWatchTerms)
    .set({
      term: parsed.data.term,
      matchType: parsed.data.matchType,
      severity: parsed.data.severity,
      caseSensitive: parsed.data.caseSensitive,
      active: parsed.data.active,
      note: parsed.data.note || null,
      channelUuid: parsed.data.channelUuid || null,
      updatedAt: new Date(),
    })
    .where(eq(adminWatchTerms.id, parsed.data.id));

  await writeAudit({
    action: AUDIT_ACTIONS.WATCH_TERM_UPDATED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "watch_term",
    targetId: String(parsed.data.id),
    targetLabel: parsed.data.term,
    metadata: {
      before: { term: current.term, severity: current.severity, active: current.active },
      after: { term: parsed.data.term, severity: parsed.data.severity, active: parsed.data.active },
    },
  });

  revalidatePath("/watchlist");
  return successState("Begriff wurde aktualisiert.");
}

export async function deleteWatchTermAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.WATCHLIST_MANAGE);
  if (!session) return error!;

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return errorState("Ungültige ID.");

  const [term] = await db.select().from(adminWatchTerms).where(eq(adminWatchTerms.id, id)).limit(1);
  if (!term) return errorState("Begriff wurde nicht gefunden.");

  await db.delete(adminWatchTerms).where(eq(adminWatchTerms.id, id));

  await writeAudit({
    action: AUDIT_ACTIONS.WATCH_TERM_DELETED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "watch_term",
    targetId: String(id),
    targetLabel: term.term,
  });

  revalidatePath("/watchlist");
  return successState(`Begriff „${term.term}“ wurde entfernt.`);
}

/** Schneller Wechsel zwischen aktiv und pausiert. */
export async function toggleWatchTermAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard(PERMISSIONS.WATCHLIST_MANAGE);
  if (!session) return error!;

  const id = Number(formData.get("id"));
  const [term] = await db.select().from(adminWatchTerms).where(eq(adminWatchTerms.id, id)).limit(1);
  if (!term) return errorState("Begriff wurde nicht gefunden.");

  const nextActive = !term.active;

  await db
    .update(adminWatchTerms)
    .set({ active: nextActive, updatedAt: new Date() })
    .where(eq(adminWatchTerms.id, id));

  await writeAudit({
    action: AUDIT_ACTIONS.WATCH_TERM_UPDATED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "watch_term",
    targetId: String(id),
    targetLabel: term.term,
    metadata: { active: nextActive },
  });

  revalidatePath("/watchlist");
  return successState(nextActive ? "Begriff ist wieder aktiv." : "Begriff pausiert.");
}

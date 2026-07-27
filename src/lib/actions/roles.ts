"use server";

import { eq, ne, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit";
import { AuthorizationError, assertPermission } from "@/lib/auth/guard";
import {
  PERMISSIONS,
  WILDCARD_PERMISSION,
  expandRequiredPermissions,
  isValidPermission,
} from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { adminRolePermissions, adminRoles, adminUserRoles } from "@/lib/db/schema";
import { errorState, fromZodError, successState, type ActionState } from "./types";

const roleSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Mindestens 2 Zeichen.")
    .max(64, "Maximal 64 Zeichen.")
    .regex(/^[a-z0-9_]+$/, "Nur Kleinbuchstaben, Ziffern und Unterstriche."),
  name: z.string().trim().min(2, "Mindestens 2 Zeichen.").max(96, "Maximal 96 Zeichen."),
  description: z.string().trim().max(255).optional().or(z.literal("")),
  priority: z.coerce.number().int().min(0, "Mindestens 0.").max(99, "Maximal 99 (100 ist dem Superadmin vorbehalten)."),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Bitte einen Hex-Farbwert angeben, z. B. #8b5cf6."),
});

async function guard() {
  try {
    return { session: await assertPermission(PERMISSIONS.ROLES_MANAGE), error: null as ActionState | null };
  } catch (error) {
    return {
      session: null,
      error: errorState(error instanceof AuthorizationError ? error.message : "Unerwarteter Fehler."),
    };
  }
}

/**
 * Validiert die gewählten Rechte und ergänzt implizite Abhängigkeiten.
 * Der Wildcard "*" kann ausschliesslich von Superadmins vergeben werden.
 */
function resolvePermissions(
  formData: FormData,
  isSuperadmin: boolean,
): { ok: true; permissions: string[] } | { ok: false; message: string } {
  const raw = formData
    .getAll("permissions")
    .map((value) => String(value))
    .filter(Boolean);

  if (raw.includes(WILDCARD_PERMISSION)) {
    if (!isSuperadmin) {
      return { ok: false, message: "Nur Superadmins dürfen Vollzugriff vergeben." };
    }
    return { ok: true, permissions: [WILDCARD_PERMISSION] };
  }

  const invalid = raw.filter((permission) => !isValidPermission(permission));
  if (invalid.length > 0) {
    return { ok: false, message: `Unbekannte Berechtigung: ${invalid.join(", ")}` };
  }

  return { ok: true, permissions: expandRequiredPermissions(raw) };
}

export async function createRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard();
  if (!session) return error!;

  const parsed = roleSchema.safeParse({
    key: formData.get("key"),
    name: formData.get("name"),
    description: formData.get("description"),
    priority: formData.get("priority"),
    color: formData.get("color"),
  });

  if (!parsed.success) return fromZodError(parsed.error);

  const isSuperadmin = session.user.permissions.includes(WILDCARD_PERMISSION);

  if (!isSuperadmin && parsed.data.priority >= session.user.maxPriority) {
    return errorState("Du kannst keine Rolle anlegen, deren Priorität deine eigene erreicht oder übersteigt.", {
      priority: [`Maximal ${session.user.maxPriority - 1}.`],
    });
  }

  const permissionResult = resolvePermissions(formData, isSuperadmin);
  if (!permissionResult.ok) return errorState(permissionResult.message);

  if (permissionResult.permissions.length === 0) {
    return errorState("Bitte mindestens eine Berechtigung auswählen.");
  }

  const [existing] = await db.select({ uuid: adminRoles.uuid }).from(adminRoles).where(eq(adminRoles.key, parsed.data.key)).limit(1);
  if (existing) {
    return errorState("Dieser Rollen-Schlüssel ist bereits vergeben.", { key: ["Bereits vergeben."] });
  }

  const uuid = uuidv4();
  const now = new Date();

  await db.insert(adminRoles).values({
    uuid,
    key: parsed.data.key,
    name: parsed.data.name,
    description: parsed.data.description || null,
    priority: parsed.data.priority,
    color: parsed.data.color,
    isSystem: false,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(adminRolePermissions).values(
    permissionResult.permissions.map((permission) => ({ roleUuid: uuid, permission })),
  );

  await writeAudit({
    action: AUDIT_ACTIONS.ROLE_CREATED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "role",
    targetId: uuid,
    targetLabel: parsed.data.name,
    metadata: { permissions: permissionResult.permissions, priority: parsed.data.priority },
  });

  revalidatePath("/roles");
  return successState(`Rolle "${parsed.data.name}" wurde angelegt.`);
}

const updateRoleSchema = roleSchema.extend({
  uuid: z.string().uuid("Ungültige Rollen-ID."),
});

export async function updateRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard();
  if (!session) return error!;

  const parsed = updateRoleSchema.safeParse({
    uuid: formData.get("uuid"),
    key: formData.get("key"),
    name: formData.get("name"),
    description: formData.get("description"),
    priority: formData.get("priority"),
    color: formData.get("color"),
  });

  if (!parsed.success) return fromZodError(parsed.error);

  const [role] = await db.select().from(adminRoles).where(eq(adminRoles.uuid, parsed.data.uuid)).limit(1);
  if (!role) return errorState("Rolle wurde nicht gefunden.");

  const isSuperadmin = session.user.permissions.includes(WILDCARD_PERMISSION);

  if (!isSuperadmin && role.priority >= session.user.maxPriority) {
    return errorState("Diese Rolle hat mindestens deine eigene Berechtigungsstufe und kann nicht bearbeitet werden.");
  }
  if (!isSuperadmin && parsed.data.priority >= session.user.maxPriority) {
    return errorState("Du kannst die Priorität nicht auf oder über deine eigene Stufe setzen.", {
      priority: [`Maximal ${session.user.maxPriority - 1}.`],
    });
  }

  const permissionResult = resolvePermissions(formData, isSuperadmin);
  if (!permissionResult.ok) return errorState(permissionResult.message);

  if (permissionResult.permissions.length === 0) {
    return errorState("Bitte mindestens eine Berechtigung auswählen.");
  }

  // Systemrollen: Schlüssel und Priorität sind unveränderlich.
  const key = role.isSystem ? role.key : parsed.data.key;
  const priority = role.isSystem ? role.priority : parsed.data.priority;

  if (!role.isSystem) {
    const [conflict] = await db
      .select({ uuid: adminRoles.uuid })
      .from(adminRoles)
      .where(and(eq(adminRoles.key, key), ne(adminRoles.uuid, parsed.data.uuid)))
      .limit(1);

    if (conflict) {
      return errorState("Dieser Rollen-Schlüssel gehört bereits zu einer anderen Rolle.", {
        key: ["Bereits vergeben."],
      });
    }
  }

  const previousPermissions = await db
    .select({ permission: adminRolePermissions.permission })
    .from(adminRolePermissions)
    .where(eq(adminRolePermissions.roleUuid, parsed.data.uuid));

  await db
    .update(adminRoles)
    .set({
      key,
      name: parsed.data.name,
      description: parsed.data.description || null,
      priority,
      color: parsed.data.color,
      updatedAt: new Date(),
    })
    .where(eq(adminRoles.uuid, parsed.data.uuid));

  await db.delete(adminRolePermissions).where(eq(adminRolePermissions.roleUuid, parsed.data.uuid));
  await db.insert(adminRolePermissions).values(
    permissionResult.permissions.map((permission) => ({ roleUuid: parsed.data.uuid, permission })),
  );

  await writeAudit({
    action: AUDIT_ACTIONS.ROLE_UPDATED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "role",
    targetId: parsed.data.uuid,
    targetLabel: parsed.data.name,
    metadata: {
      before: { permissions: previousPermissions.map((row) => row.permission), priority: role.priority },
      after: { permissions: permissionResult.permissions, priority },
    },
  });

  revalidatePath("/roles");
  return successState("Rolle wurde aktualisiert.");
}

export async function deleteRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { session, error } = await guard();
  if (!session) return error!;

  const uuid = String(formData.get("uuid") ?? "");

  const [role] = await db.select().from(adminRoles).where(eq(adminRoles.uuid, uuid)).limit(1);
  if (!role) return errorState("Rolle wurde nicht gefunden.");

  if (role.isSystem) {
    return errorState("Systemrollen können nicht gelöscht werden.");
  }

  const isSuperadmin = session.user.permissions.includes(WILDCARD_PERMISSION);
  if (!isSuperadmin && role.priority >= session.user.maxPriority) {
    return errorState("Diese Rolle hat mindestens deine eigene Berechtigungsstufe.");
  }

  const assignments = await db
    .select({ userUuid: adminUserRoles.userUuid })
    .from(adminUserRoles)
    .where(eq(adminUserRoles.roleUuid, uuid));

  if (assignments.length > 0) {
    return errorState(
      `Diese Rolle ist noch ${assignments.length} Account(s) zugewiesen. Entferne die Zuweisungen zuerst.`,
    );
  }

  await db.delete(adminRoles).where(eq(adminRoles.uuid, uuid));

  await writeAudit({
    action: AUDIT_ACTIONS.ROLE_DELETED,
    actorUuid: session.user.uuid,
    actorName: session.user.username,
    targetType: "role",
    targetId: uuid,
    targetLabel: role.name,
  });

  revalidatePath("/roles");
  return successState(`Rolle "${role.name}" wurde gelöscht.`);
}

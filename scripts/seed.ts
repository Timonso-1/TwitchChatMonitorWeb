import "dotenv/config";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db, pool } from "../src/lib/db";
import { adminRolePermissions, adminRoles, adminUserRoles, adminUsers } from "../src/lib/db/schema";
import { DEFAULT_ROLES } from "../src/lib/auth/permissions";
import { checkPasswordStrength } from "../src/lib/auth/password-policy";
import { generatePassword, hashPassword } from "../src/lib/auth/password";

/**
 * Legt die Standardrollen und – falls noch keiner existiert – den ersten
 * Superadmin an. Mehrfaches Ausfuehren ist unschaedlich.
 *
 * Aufruf: npm run seed
 */

async function seedRoles(): Promise<Map<string, string>> {
  const roleUuidByKey = new Map<string, string>();
  const now = new Date();

  for (const definition of DEFAULT_ROLES) {
    const [existing] = await db
      .select({ uuid: adminRoles.uuid })
      .from(adminRoles)
      .where(eq(adminRoles.key, definition.key))
      .limit(1);

    if (existing) {
      roleUuidByKey.set(definition.key, existing.uuid);
      console.log(`  Rolle "${definition.name}" existiert bereits – uebersprungen.`);
      continue;
    }

    const uuid = uuidv4();

    await db.insert(adminRoles).values({
      uuid,
      key: definition.key,
      name: definition.name,
      description: definition.description,
      priority: definition.priority,
      color: definition.color,
      isSystem: definition.isSystem,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(adminRolePermissions).values(
      definition.permissions.map((permission) => ({ roleUuid: uuid, permission })),
    );

    roleUuidByKey.set(definition.key, uuid);
    console.log(`  Rolle "${definition.name}" angelegt (${definition.permissions.length} Recht(e)).`);
  }

  return roleUuidByKey;
}

async function seedSuperadmin(roleUuidByKey: Map<string, string>): Promise<void> {
  const existing = await db.select({ uuid: adminUsers.uuid }).from(adminUsers).limit(1);

  if (existing.length > 0) {
    console.log("  Es existiert bereits mindestens ein Account – Superadmin wird nicht neu angelegt.");
    return;
  }

  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const username = (process.env.SEED_ADMIN_USERNAME ?? "admin").trim().toLowerCase();
  let password = process.env.SEED_ADMIN_PASSWORD ?? "";

  if (!email) {
    throw new Error("SEED_ADMIN_EMAIL fehlt in der .env.");
  }

  let generated = false;
  if (!password) {
    password = generatePassword();
    generated = true;
  } else {
    const strength = checkPasswordStrength(password);
    if (!strength.ok) {
      throw new Error(`SEED_ADMIN_PASSWORD erfuellt die Anforderungen nicht:\n  - ${strength.errors.join("\n  - ")}`);
    }
  }

  const uuid = uuidv4();
  const now = new Date();

  await db.insert(adminUsers).values({
    uuid,
    email,
    username,
    displayName: "Superadmin",
    passwordHash: await hashPassword(password),
    isActive: true,
    // Bei generiertem Passwort ist ein Wechsel Pflicht.
    mustChangePassword: generated,
    createdAt: now,
    updatedAt: now,
    passwordChangedAt: now,
  });

  const superadminRoleUuid = roleUuidByKey.get("superadmin");
  if (!superadminRoleUuid) {
    throw new Error("Superadmin-Rolle konnte nicht ermittelt werden.");
  }

  await db.insert(adminUserRoles).values({
    userUuid: uuid,
    roleUuid: superadminRoleUuid,
    assignedAt: now,
  });

  console.log("");
  console.log("  Superadmin angelegt:");
  console.log(`    Benutzername: ${username}`);
  console.log(`    E-Mail:       ${email}`);
  console.log(`    Passwort:     ${generated ? password : "(aus SEED_ADMIN_PASSWORD)"}`);
  console.log("");
  console.log("  Beim ersten Login muss die Zwei-Faktor-Authentifizierung eingerichtet werden.");
}

async function main(): Promise<void> {
  console.log("");
  console.log("TwitchPanel – Seed");
  console.log("==================");
  console.log("");

  if (!process.env.ENCRYPTION_KEY) {
    console.warn("  Warnung: ENCRYPTION_KEY ist nicht gesetzt. Erzeuge ihn mit `npm run genkeys`.");
    console.warn("  Ohne diesen Schluessel schlaegt die 2FA-Einrichtung spaeter fehl.");
    console.log("");
  }

  console.log("Rollen:");
  const roleUuidByKey = await seedRoles();

  console.log("");
  console.log("Superadmin:");
  await seedSuperadmin(roleUuidByKey);

  console.log("");
  console.log("Fertig.");
  console.log("");
}

main()
  .catch((error) => {
    console.error("");
    console.error("Seed fehlgeschlagen:");
    console.error(error instanceof Error ? error.message : error);
    console.error("");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

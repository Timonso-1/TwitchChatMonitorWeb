import { and, eq, isNull } from "drizzle-orm";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { adminRecoveryCodes } from "@/lib/db/schema";
import { decrypt, encrypt, sha256 } from "./crypto";
import { randomBytes } from "node:crypto";

// Ein Zeitfenster Toleranz in beide Richtungen (+/- 30 Sekunden).
authenticator.options = { window: 1, step: 30, digits: 6 };

export const RECOVERY_CODE_COUNT = 10;

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function encryptTotpSecret(secret: string): string {
  return encrypt(secret);
}

export function decryptTotpSecret(encrypted: string): string {
  return decrypt(encrypted);
}

export function buildOtpAuthUrl(secret: string, accountLabel: string): string {
  const issuer = process.env.TOTP_ISSUER ?? "TwitchPanel";
  return authenticator.keyuri(accountLabel, issuer, secret);
}

export async function buildQrCodeDataUrl(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 240,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

/** Prueft einen 6-stelligen TOTP-Code gegen das verschluesselte Secret. */
export function verifyTotpCode(encryptedSecret: string, code: string): boolean {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;

  try {
    const secret = decryptTotpSecret(encryptedSecret);
    return authenticator.verify({ token: normalized, secret });
  } catch {
    return false;
  }
}

/** Prueft einen Code gegen ein noch unverschluesseltes Secret (Setup-Vorgang). */
export function verifyTotpCodeRaw(secret: string, code: string): boolean {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;

  try {
    return authenticator.verify({ token: normalized, secret });
  } catch {
    return false;
  }
}

/** Format: XXXX-XXXX-XXXX (Crockford-aehnliches Alphabet ohne Verwechslungszeichen). */
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateRecoveryCode(): string {
  const bytes = randomBytes(12);
  const chars = [...bytes].map((byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]);
  return [chars.slice(0, 4).join(""), chars.slice(4, 8).join(""), chars.slice(8, 12).join("")].join("-");
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashRecoveryCode(code: string): string {
  return sha256(normalizeRecoveryCode(code));
}

/**
 * Erzeugt einen frischen Satz Recovery-Codes, ersetzt alle bisherigen
 * und gibt die Klartext-Codes genau einmal zurueck.
 */
export async function regenerateRecoveryCodes(userUuid: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
  const now = new Date();

  await db.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.userUuid, userUuid));
  await db.insert(adminRecoveryCodes).values(
    codes.map((code) => ({
      userUuid,
      codeHash: hashRecoveryCode(code),
      createdAt: now,
    })),
  );

  return codes;
}

/** Verbraucht einen Recovery-Code. Gibt true zurueck, wenn er gueltig war. */
export async function consumeRecoveryCode(userUuid: string, code: string): Promise<boolean> {
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length !== 12) return false;

  const codeHash = hashRecoveryCode(normalized);

  const [match] = await db
    .select({ id: adminRecoveryCodes.id })
    .from(adminRecoveryCodes)
    .where(
      and(
        eq(adminRecoveryCodes.userUuid, userUuid),
        eq(adminRecoveryCodes.codeHash, codeHash),
        isNull(adminRecoveryCodes.usedAt),
      ),
    )
    .limit(1);

  if (!match) return false;

  await db
    .update(adminRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(eq(adminRecoveryCodes.id, match.id));

  return true;
}

export async function countUnusedRecoveryCodes(userUuid: string): Promise<number> {
  const rows = await db
    .select({ id: adminRecoveryCodes.id })
    .from(adminRecoveryCodes)
    .where(and(eq(adminRecoveryCodes.userUuid, userUuid), isNull(adminRecoveryCodes.usedAt)));

  return rows.length;
}

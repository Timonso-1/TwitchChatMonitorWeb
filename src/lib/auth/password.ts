import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { checkPasswordStrength } from "./password-policy";

/** OWASP-konforme Argon2id-Parameter (Stand 2024). */
const ARGON2_OPTIONS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

const GENERATOR_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+";

/** Erzeugt ein zufaelliges Passwort, das die Staerkeanforderungen sicher erfuellt. */
export function generatePassword(length = 20): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = randomBytes(length);
    const password = [...bytes].map((byte) => GENERATOR_ALPHABET[byte % GENERATOR_ALPHABET.length]).join("");

    if (checkPasswordStrength(password).ok) return password;
  }

  // Fallback: Zeichenklassen deterministisch erzwingen.
  const bytes = randomBytes(length);
  const base = [...bytes].map((byte) => GENERATOR_ALPHABET[byte % GENERATOR_ALPHABET.length]);
  base[0] = "A";
  base[1] = "a";
  base[2] = "7";
  base[3] = "#";
  return base.join("");
}

export {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  checkPasswordStrength,
  type PasswordCheckResult,
} from "./password-policy";

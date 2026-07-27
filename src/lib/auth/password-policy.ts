/**
 * Passwortrichtlinie ohne Node-spezifische Abhängigkeiten,
 * damit sie auch in Client-Komponenten importiert werden kann.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_REQUIREMENTS = [
  `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen`,
  "Gross- und Kleinbuchstaben",
  "Mindestens eine Ziffer",
  "Mindestens ein Sonderzeichen",
] as const;

export interface PasswordCheckResult {
  ok: boolean;
  errors: string[];
}

export function checkPasswordStrength(password: string): PasswordCheckResult {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Mindestens ${PASSWORD_MIN_LENGTH} Zeichen erforderlich.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Maximal ${PASSWORD_MAX_LENGTH} Zeichen erlaubt.`);
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Mindestens ein Kleinbuchstabe erforderlich.");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Mindestens ein Grossbuchstabe erforderlich.");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Mindestens eine Ziffer erforderlich.");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("Mindestens ein Sonderzeichen erforderlich.");
  }

  return { ok: errors.length === 0, errors };
}

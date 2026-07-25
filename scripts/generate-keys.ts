import { randomBytes } from "node:crypto";

/**
 * Erzeugt die Schluessel, die das Panel in der .env benoetigt.
 * Aufruf: npm run genkeys
 */
const encryptionKey = randomBytes(32).toString("base64");

console.log("");
console.log("Trage folgenden Wert in deine .env ein:");
console.log("");
console.log(`ENCRYPTION_KEY=${encryptionKey}`);
console.log("");
console.log("WICHTIG: Dieser Schluessel verschluesselt die TOTP-Secrets in der Datenbank.");
console.log("Wird er geaendert oder verloren, muessen alle Nutzer ihre 2FA neu einrichten.");
console.log("");

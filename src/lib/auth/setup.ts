import "server-only";
import { encrypt } from "./crypto";
import { buildOtpAuthUrl, buildQrCodeDataUrl, generateTotpSecret } from "./totp";

export interface TwoFactorSetupData {
  /** Klartext-Secret zur Anzeige (QR-Code / manuelle Eingabe). */
  secret: string;
  /**
   * Verschluesselte Fassung des Secrets fuer das versteckte Formularfeld.
   * Manipulation faellt beim Entschluesseln durch den GCM-Auth-Tag auf.
   */
  secretToken: string;
  qrCode: string;
}

/**
 * Erzeugt ein neues TOTP-Secret samt QR-Code.
 * Es wird bewusst NICHT in der Datenbank gespeichert – das passiert erst,
 * wenn der Nutzer das Setup mit einem gueltigen Code bestaetigt.
 */
export async function createTwoFactorSetup(accountLabel: string): Promise<TwoFactorSetupData> {
  const secret = generateTotpSecret();
  const otpauthUrl = buildOtpAuthUrl(secret, accountLabel);
  const qrCode = await buildQrCodeDataUrl(otpauthUrl);

  return {
    secret,
    secretToken: encrypt(secret),
    qrCode,
  };
}

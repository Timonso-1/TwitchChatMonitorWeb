/**
 * Leichtgewichtige Auswertung von User-Agent-Strings.
 *
 * Bewusst ohne Bibliothek: es geht nur darum, in der Sitzungsliste
 * "Chrome auf Windows" statt eines 120 Zeichen langen Roh-Strings zu zeigen.
 * Für Statistik oder Feature-Erkennung waere das zu ungenau.
 */

export type DeviceKind = "desktop" | "mobile" | "tablet" | "bot" | "unknown";

export interface ParsedUserAgent {
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  device: DeviceKind;
  /** Fertige Beschreibung, z. B. "Chrome 131 · Windows". */
  label: string;
}

const BROWSERS: Array<{ name: string; pattern: RegExp }> = [
  // Reihenfolge ist wichtig: Edge und Opera enthalten "Chrome" im String.
  { name: "Edge", pattern: /Edg(?:e|A|iOS)?\/([\d.]+)/ },
  { name: "Opera", pattern: /OPR\/([\d.]+)/ },
  { name: "Samsung Internet", pattern: /SamsungBrowser\/([\d.]+)/ },
  { name: "Firefox", pattern: /Firefox\/([\d.]+)/ },
  { name: "Chrome", pattern: /Chrome\/([\d.]+)/ },
  { name: "Safari", pattern: /Version\/([\d.]+).*Safari/ },
];

const OPERATING_SYSTEMS: Array<{ name: string; pattern: RegExp }> = [
  { name: "Windows 11/10", pattern: /Windows NT 10\.0/ },
  { name: "Windows 8.1", pattern: /Windows NT 6\.3/ },
  { name: "Windows", pattern: /Windows NT/ },
  { name: "Android", pattern: /Android\s([\d.]+)/ },
  { name: "iOS", pattern: /(?:iPhone|iPad).*OS\s(\d+)/ },
  { name: "macOS", pattern: /Mac OS X/ },
  { name: "Linux", pattern: /Linux/ },
];

function detectDevice(userAgent: string): DeviceKind {
  if (/bot|crawler|spider|curl|wget|postman/i.test(userAgent)) return "bot";
  if (/iPad|Tablet/i.test(userAgent)) return "tablet";
  if (/Mobile|Android|iPhone/i.test(userAgent)) return "mobile";
  if (/Windows|Macintosh|Linux|X11/i.test(userAgent)) return "desktop";
  return "unknown";
}

export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
  if (!userAgent) {
    return { browser: null, browserVersion: null, os: null, device: "unknown", label: "Unbekanntes Gerät" };
  }

  let browser: string | null = null;
  let browserVersion: string | null = null;

  for (const entry of BROWSERS) {
    const match = userAgent.match(entry.pattern);
    if (match) {
      browser = entry.name;
      // Nur die Hauptversion – die Unterversionen sind hier ohne Wert.
      browserVersion = match[1]?.split(".")[0] ?? null;
      break;
    }
  }

  let os: string | null = null;
  for (const entry of OPERATING_SYSTEMS) {
    if (entry.pattern.test(userAgent)) {
      os = entry.name;
      break;
    }
  }

  const device = detectDevice(userAgent);

  const parts: string[] = [];
  if (browser) parts.push(browserVersion ? `${browser} ${browserVersion}` : browser);
  if (os) parts.push(os);

  return {
    browser,
    browserVersion,
    os,
    device,
    label: parts.length > 0 ? parts.join(" · ") : "Unbekanntes Gerät",
  };
}

/** Macht aus einer IP-Adresse eine lesbare Angabe. */
export function formatIpAddress(ip: string | null | undefined): string {
  if (!ip) return "—";

  // Loopback-Adressen sind in der Praxis "der Server selbst".
  if (ip === "::1" || ip === "127.0.0.1") return "Lokal";

  // IPv4-mapped IPv6 auf die IPv4-Form kuerzen.
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return mapped ? mapped[1] : ip;
}

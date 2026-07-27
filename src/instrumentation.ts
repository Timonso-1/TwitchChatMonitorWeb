/**
 * Läuft einmalig beim Start des Servers. Nur im Node.js-Runtime relevant –
 * die Edge-Runtime hat keine Datenbankverbindung und keine Timer, die
 * über eine Anfrage hinaus leben.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWatchlistAlertPolling } = await import("@/lib/watchlist-alerts");
    startWatchlistAlertPolling();
  }
}

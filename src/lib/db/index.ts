import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

/**
 * Ein einziger Connection-Pool pro Prozess.
 * Im Dev-Modus wird er am globalThis gecacht, damit Hot-Reload keine Pools leakt.
 */
const globalForDb = globalThis as unknown as {
  __twitchPanelPool?: mysql.Pool;
};

/**
 * Obergrenze für eine einzelne Abfrage, in Sekunden.
 *
 * Der Server ist MariaDB; dort heisst die Variable `max_statement_time` und
 * rechnet in Sekunden. MySQLs `max_execution_time` (Millisekunden, nur SELECT)
 * existiert hier nicht. Voreinstellung auf dem Server ist 0, also unbegrenzt –
 * eine hängende Abfrage würde die Anfrage sonst nie freigeben.
 */
const STATEMENT_TIMEOUT_SECONDS = 15;

/** Wartezeit auf den TCP-Verbindungsaufbau. Die Datenbank haengt an einem Tunnel. */
const CONNECT_TIMEOUT_MS = 10_000;

/**
 * Obergrenze für wartende Anfragen, wenn alle Verbindungen belegt sind.
 *
 * Ohne Limit (0) waechst die Warteschlange unbegrenzt: bei einer Stoerung
 * haengen alle Anfragen, statt schnell und sichtbar zu scheitern.
 */
const QUEUE_LIMIT = 50;

function createPool(): mysql.Pool {
  const required = ["DB_HOST", "DB_USER", "DB_NAME"] as const;
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Umgebungsvariable ${key} fehlt. Bitte .env prüfen.`);
    }
  }

  return mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 15),
    waitForConnections: true,
    queueLimit: QUEUE_LIMIT,
    connectTimeout: CONNECT_TIMEOUT_MS,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    timezone: "Z",
    charset: "utf8mb4_unicode_ci",
    supportBigNumbers: true,
    bigNumberStrings: false,
    dateStrings: false,
  });
}

export const pool: mysql.Pool = globalForDb.__twitchPanelPool ?? createPool();

if (!globalForDb.__twitchPanelPool) {
  // Jede neue Verbindung bekommt die Zeitgrenze mitgegeben. mysql2 kennt keine
  // Option für Start-SQL, deshalb ueber das Pool-Ereignis.
  //
  // Die Umtypisierung ist noetig, weil dieses Ereignis auch bei `mysql2/promise`
  // eine Verbindung mit Rueckruf-Schnittstelle liefert – die Typen behaupten
  // etwas anderes. Ohne den Rueckruf laeuft die Abfrage ins Leere.
  pool.on("connection", (connection) => {
    const raw = connection as unknown as {
      query: (sql: string, callback: (error: unknown) => void) => void;
    };

    raw.query(`SET SESSION max_statement_time = ${STATEMENT_TIMEOUT_SECONDS}`, (error) => {
      // Schlaegt es fehl, laeuft die Verbindung ohne Zeitgrenze weiter –
      // schlechter als gewollt, aber kein Grund, die Anfrage abzubrechen.
      if (error) console.error("[db] Zeitgrenze konnte nicht gesetzt werden:", error);
    });
  });
}

if (process.env.NODE_ENV !== "production") {
  globalForDb.__twitchPanelPool = pool;
}

export const db = drizzle(pool, { schema, mode: "default" });

export { schema };
export type Database = typeof db;

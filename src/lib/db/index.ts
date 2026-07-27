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

if (process.env.NODE_ENV !== "production") {
  globalForDb.__twitchPanelPool = pool;
}

export const db = drizzle(pool, { schema, mode: "default" });

export { schema };
export type Database = typeof db;

import mysql from "mysql2/promise";
import { config } from "../config.js";

let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (pool) return pool;
  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    ssl: config.db.ssl ? { rejectUnauthorized: true } : undefined,
    connectionLimit: config.db.poolSize,
    waitForConnections: true,
    connectTimeout: 10_000,
    dateStrings: true,
  });
  return pool;
}

export async function query<T = unknown>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const [rows] = await getPool().execute(sql, params);
  return rows as T[];
}

export async function ping(): Promise<boolean> {
  const rows = await query<{ ok: number }>("SELECT 1 AS ok");
  return rows[0]?.ok === 1;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

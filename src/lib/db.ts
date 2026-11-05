import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

if (!process.env.DB_PASSWORD) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

declare global {
  // eslint-disable-next-line no-var
  var __mysqlPool: mysql.Pool | undefined;
}

const dbConfig: mysql.PoolOptions = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bantuin_db',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  timezone: '+07:00',
  decimalNumbers: true,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
};

export const pool: mysql.Pool =
  globalThis.__mysqlPool ?? mysql.createPool(dbConfig);

if (process.env.NODE_ENV !== 'production') {
  globalThis.__mysqlPool = pool;
}

/**
 * Helper untuk query SQL terstandar dengan tipe data generic
 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T> {
  const [rows] = await pool.execute(sql, params);
  return rows as T;
}

/**
 * Memeriksa status kesehatan koneksi database secara aman
 */
export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  latencyMs?: number;
}> {
  const startTime = Date.now();
  try {
    const connection = await pool.getConnection();
    try {
      await connection.ping();
      const latencyMs = Date.now() - startTime;
      return { connected: true, latencyMs };
    } finally {
      connection.release();
    }
  } catch {
    return { connected: false };
  }
}

import { readFileSync } from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  waitForConnections: true,
  connectionLimit: env.mysql.poolSize,
  queueLimit: 100,
  charset: 'utf8mb4',
  timezone: 'Z',
  ssl: env.mysql.ssl ? {
    rejectUnauthorized: true,
    ...(env.mysql.sslCaPath ? { ca: readFileSync(path.resolve(env.mysql.sslCaPath), 'utf8') } : {}),
  } : undefined,
});

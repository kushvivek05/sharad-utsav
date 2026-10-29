import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../config/database.js';

const migrationDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));

export async function runMigrations() {
  const connection = await pool.getConnection();
  try {
    const [lockRows] = await connection.query<RowDataPacket[]>('SELECT GET_LOCK(?, 30) AS acquired', ['sharad_utsav:migrations']);
    if (Number(lockRows[0]?.acquired) !== 1) throw new Error('Could not acquire the database migration lock.');

    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(100) NOT NULL PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    const files = (await readdir(migrationDirectory)).filter(file => /^\d+_[a-z0-9_-]+\.sql$/.test(file)).sort();
    for (const file of files) {
      const [applied] = await connection.execute<RowDataPacket[]>('SELECT name FROM schema_migrations WHERE name = ?', [file]);
      if (applied.length) continue;
      const sql = await readFile(path.join(migrationDirectory, file), 'utf8');
      for (const statement of sql.split(';').map(item => item.trim()).filter(Boolean)) await connection.query(statement);
      await connection.execute('INSERT INTO schema_migrations (name, applied_at) VALUES (?, UTC_TIMESTAMP(3))', [file]);
      console.log(`Applied database migration ${file}`);
    }
  } finally {
    await connection.query('SELECT RELEASE_LOCK(?)', ['sharad_utsav:migrations']).catch(() => undefined);
    connection.release();
  }
}

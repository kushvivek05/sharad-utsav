import { runMigrations } from '../services/migrations.js';
import { pool } from '../config/database.js';

try {
  await runMigrations();
} catch (error) {
  console.error('Database migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

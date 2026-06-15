/**
 * Database connection + boot-time migration.
 *
 * Production: node-postgres against DATABASE_URL.
 * Tests / sandbox: PGlite (in-process Postgres) when USE_PGLITE is set.
 * Neither configured: db stays null and DB-backed features are disabled.
 */
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as schema from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = join(__dirname, 'schema.sql');

let db = null;
let runMigrations = async () => {};

if (process.env.USE_PGLITE) {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const client = new PGlite(process.env.PGLITE_DIR || undefined); // in-memory if undefined
  db = drizzle(client, { schema });
  runMigrations = async () => {
    const sql = await readFile(SCHEMA_SQL, 'utf8');
    await client.exec(sql);
  };
} else if (process.env.DATABASE_URL) {
  const pg = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const Pool = pg.default?.Pool || pg.Pool;
  const url = process.env.DATABASE_URL;
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  const pool = new Pool({
    connectionString: url,
    ssl:
      process.env.DATABASE_SSL === 'false' || isLocal
        ? false
        : { rejectUnauthorized: false },
  });
  db = drizzle(pool, { schema });
  runMigrations = async () => {
    const sql = await readFile(SCHEMA_SQL, 'utf8');
    await pool.query(sql);
  };
}

export function hasDb() {
  return Boolean(db);
}

export { db, runMigrations, schema };

import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { sql } from './client.js';
import { logger } from '../utils/logger.js';

const migrationsDir = path.join(env.ROOT_DIR, 'migrations');

async function ensureMigrationsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function appliedIds() {
  const rows = await sql`SELECT id FROM schema_migrations ORDER BY id`;
  return new Set(rows.map((row) => row.id));
}

export async function runMigrations() {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations folder not found: ${migrationsDir}`);
  }

  await ensureMigrationsTable();
  const done = await appliedIds();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const id = path.basename(file, '.sql');
    if (done.has(id)) {
      logger.debug({ id }, 'migration already applied');
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const body = fs.readFileSync(filePath, 'utf8');
    const statements = body
      .split(';')
      .map((part) => part.replace(/--.*$/gm, '').trim())
      .filter(Boolean);

    if (!statements.length) continue;

    logger.info({ id }, 'applying migration');
    for (const statement of statements) {
      await sql(statement);
    }
    await sql`INSERT INTO schema_migrations (id) VALUES (${id})`;
    logger.info({ id }, 'migration applied');
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(env.ROOT_DIR, 'src/db/migrate.js');

if (isDirectRun) {
  runMigrations()
    .then(() => {
      logger.info('migrations complete');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ err: error }, 'migration failed');
      process.exit(1);
    });
}

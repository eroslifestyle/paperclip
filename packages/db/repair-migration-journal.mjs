#!/usr/bin/env node
/**
 * Repair Drizzle migration journal by marking all migration files as applied.
 *
 * Use case: DB schema is up-to-date (es. ripristinato da backup) ma il journal
 * `drizzle.__drizzle_migrations` non ha le entry per le migration successive a
 * 0000. Questo script popola le entry mancanti senza riapplicare il SQL.
 *
 * Avvia embedded-postgres sulla porta 54329 (stesso path del config.json),
 * inserisce tutte le entry mancanti, poi spegne PG.
 *
 * Uso:
 *   node scripts/repair-migration-journal.mjs
 */

import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = "D:\\Dropbox\\1_Forex\\Programmazione\\PaperClip";
const INSTANCE_DIR = path.join(REPO_ROOT, "instances", "default");
const DB_DIR = path.join(INSTANCE_DIR, "db");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "packages", "db", "dist", "migrations");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
const PORT = 54329;

const DB_NAME = "paperclip";
const DB_USER = "paperclip";
const DB_PASSWORD = "paperclip";

console.log(`[repair] Repo: ${REPO_ROOT}`);
console.log(`[repair] DB dir: ${DB_DIR}`);
console.log(`[repair] Migrations: ${MIGRATIONS_DIR}`);

// Step 1: load journal entries
const journal = JSON.parse(await readFile(JOURNAL_PATH, "utf8"));
const journalByTag = new Map(journal.entries.map((e) => [e.tag, e]));
console.log(`[repair] Journal entries: ${journal.entries.length}`);

// Step 2: read migration .sql files
const sqlFiles = (await readdir(MIGRATIONS_DIR))
  .filter((f) => f.endsWith(".sql"))
  .sort();
console.log(`[repair] Migration files: ${sqlFiles.length}`);

// Step 3: spawn embedded postgres
const pg = new EmbeddedPostgres({
  databaseDir: DB_DIR,
  user: DB_USER,
  password: DB_PASSWORD,
  port: PORT,
  persistent: true,
});

console.log(`[repair] Starting embedded postgres on :${PORT}...`);
await pg.start();
console.log(`[repair] Postgres started.`);

const url = `postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`;
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  // Step 4: ensure drizzle schema/table exist
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )`;

  // Step 5: read existing entries
  const existing = await sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations`;
  const existingHashes = new Set(existing.map((r) => r.hash));
  console.log(`[repair] Existing entries: ${existing.length}`);

  // Step 6: insert missing entries
  let inserted = 0;
  for (const file of sqlFiles) {
    const tag = file.replace(/\.sql$/, "");
    const journalEntry = journalByTag.get(tag);
    if (!journalEntry) {
      console.log(`[repair] WARN: ${tag} not in journal, skip`);
      continue;
    }
    const content = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    const hash = createHash("sha256").update(content).digest("hex");
    const createdAt = String(journalEntry.when);

    if (existingHashes.has(hash)) {
      // already applied (by hash)
      continue;
    }

    await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
              VALUES (${hash}, ${createdAt})`;
    inserted++;
    console.log(`[repair] Inserted ${tag} (hash=${hash.substring(0, 8)}, when=${createdAt})`);
  }

  console.log(`[repair] Done. Inserted ${inserted} new entries.`);

  // Step 7: verify
  const final = await sql`SELECT COUNT(*) AS c FROM drizzle.__drizzle_migrations`;
  console.log(`[repair] Total entries now: ${final[0].c}`);
} finally {
  await sql.end();
  console.log(`[repair] Stopping postgres...`);
  await pg.stop();
  console.log(`[repair] Postgres stopped.`);
}

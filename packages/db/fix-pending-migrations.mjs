#!/usr/bin/env node
/**
 * Rimuove dal journal Drizzle le entry per le migration 0056-0074.
 *
 * Il problema: queste migration sono nuove (arrivate col merge upstream
 * dei 136 commit) e non sono mai state applicate al DB esistente. Lo script
 * `repair-migration-journal.mjs` ha inserito le entry nel journal credendo
 * che fossero già applicate, ma in realtà il SQL non era mai girato.
 * Risultato: tabelle/colonne nuove (inbox_dismissals, issue_relations,
 * heartbeat_runs.process_group_id, projects.env, ...) mancanti.
 *
 * Soluzione: rimuovere SOLO le entry per 0056*-0074*, così al riavvio
 * Drizzle le applica davvero.
 *
 * Uso (con Paperclip CHIUSO, postgres orfani killati):
 *   node fix-pending-migrations.mjs
 */

import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = "D:\\Dropbox\\1_Forex\\Programmazione\\PaperClip";
const INSTANCE_DIR = path.join(REPO_ROOT, "instances", "default");
const DB_DIR = path.join(INSTANCE_DIR, "db");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "packages", "db", "src", "migrations");
const PORT = 54329;
const DB_NAME = "paperclip";
const DB_USER = "paperclip";
const DB_PASSWORD = "paperclip";

// Range di migration NON ancora applicate al DB (dal log "Applying 19 pending migrations").
const PENDING_RANGE_START = 56;  // 0056_spooky_ultragirl.sql
const PENDING_RANGE_END = 74;    // 0074_striped_genesis.sql

console.log(`[fix] Repo: ${REPO_ROOT}`);
console.log(`[fix] DB dir: ${DB_DIR}`);
console.log(`[fix] Pending range: 0${String(PENDING_RANGE_START).padStart(3, "0")} - 0${String(PENDING_RANGE_END).padStart(3, "0")}`);

// Trova i file SQL nel range
const sqlFiles = (await readdir(MIGRATIONS_DIR))
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .filter((f) => {
    const idx = parseInt(f.substring(0, 4), 10);
    return idx >= PENDING_RANGE_START && idx <= PENDING_RANGE_END;
  })
  .sort();

console.log(`[fix] Files in range: ${sqlFiles.length}`);
sqlFiles.forEach((f) => console.log(`  - ${f}`));

// Calcola hash di ogni file
const targetHashes = new Map();
for (const file of sqlFiles) {
  const content = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
  const hash = createHash("sha256").update(content).digest("hex");
  targetHashes.set(hash, file);
}

// Avvia embedded postgres
const pg = new EmbeddedPostgres({
  databaseDir: DB_DIR,
  user: DB_USER,
  password: DB_PASSWORD,
  port: PORT,
  persistent: true,
});

console.log(`[fix] Starting embedded postgres on :${PORT}...`);
await pg.start();
console.log(`[fix] Postgres started.`);

const url = `postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`;
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  // Conta entry attuali
  const before = await sql`SELECT COUNT(*) AS c FROM drizzle.__drizzle_migrations`;
  console.log(`[fix] Journal entries before: ${before[0].c}`);

  // Rimuovi le entry per i hash target
  let removed = 0;
  for (const [hash, file] of targetHashes) {
    const result = await sql`
      DELETE FROM drizzle.__drizzle_migrations
      WHERE hash = ${hash}
      RETURNING id
    `;
    if (result.length > 0) {
      console.log(`[fix] Removed ${result.length} entry for ${file} (hash=${hash.substring(0, 8)})`);
      removed += result.length;
    } else {
      console.log(`[fix] No entry found for ${file} (hash=${hash.substring(0, 8)}) - skipping`);
    }
  }

  // Conta entry finali
  const after = await sql`SELECT COUNT(*) AS c FROM drizzle.__drizzle_migrations`;
  console.log(`[fix] Journal entries after: ${after[0].c}`);
  console.log(`[fix] Total removed: ${removed}`);
  console.log(`[fix] Done. Restart paperclip to let Drizzle apply pending migrations.`);
} finally {
  await sql.end();
  console.log(`[fix] Stopping postgres...`);
  await pg.stop();
  console.log(`[fix] Postgres stopped.`);
}

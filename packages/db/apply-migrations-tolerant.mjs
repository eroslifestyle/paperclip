#!/usr/bin/env node
/**
 * Applica le migration 0057-0074 in modo tollerante: salta gli statement che
 * falliscono per "relation already exists" / "duplicate column" / etc.
 *
 * Caso d'uso: il DB ha schema parzialmente applicato (alcune tabelle/colonne
 * delle nuove migration esistono già, altre no). Questo script applica solo
 * le parti mancanti, senza rifiutare il file intero.
 *
 * Errori PostgreSQL ignorati:
 *   42P07  relation already exists  (CREATE TABLE/INDEX)
 *   42710  duplicate_object         (CREATE TYPE/CONSTRAINT)
 *   42701  duplicate_column         (ALTER TABLE ADD COLUMN)
 *   42704  undefined_object         (DROP che non esiste)
 *   42P01  undefined_table          (riferimento a tabella che non c'è — caso da loggare ma continuare)
 *
 * Uso (Paperclip CHIUSO, postgres orfani killati):
 *   node apply-migrations-tolerant.mjs
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

// Range applicabile (0056 e successive sono le pending dopo merge upstream).
const RANGE_START = 56;
const RANGE_END = 74;

// Codici errore Postgres ignorabili (lo schema è "logicamente applicato")
const IGNORABLE_CODES = new Set([
  "42P07",  // duplicate_table (relation already exists)
  "42710",  // duplicate_object (type, constraint, index)
  "42701",  // duplicate_column
  "42704",  // undefined_object (DROP IF EXISTS che non esiste)
  "42P16",  // invalid_table_definition (es. "is not a constraint of relation")
]);

console.log(`[apply] Repo: ${REPO_ROOT}`);
console.log(`[apply] DB dir: ${DB_DIR}`);
console.log(`[apply] Migrations: ${MIGRATIONS_DIR}`);
console.log(`[apply] Range: 0${String(RANGE_START).padStart(3, "0")} - 0${String(RANGE_END).padStart(3, "0")}`);

// Trova file SQL nel range
const sqlFiles = (await readdir(MIGRATIONS_DIR))
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .filter((f) => {
    const idx = parseInt(f.substring(0, 4), 10);
    return idx >= RANGE_START && idx <= RANGE_END;
  })
  .sort();

console.log(`[apply] Files to process: ${sqlFiles.length}`);

// Avvia embedded postgres
const pg = new EmbeddedPostgres({
  databaseDir: DB_DIR,
  user: DB_USER,
  password: DB_PASSWORD,
  port: PORT,
  persistent: true,
});

console.log(`[apply] Starting embedded postgres on :${PORT}...`);
await pg.start();
console.log(`[apply] Postgres started.`);

const url = `postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`;
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  // Verifica esistenza journal
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )`;

  const journal = JSON.parse(
    await readFile(path.join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
  );
  const journalByTag = new Map(journal.entries.map((e) => [e.tag, e]));

  // Hash già nel journal
  const existingRows = await sql`SELECT hash FROM drizzle.__drizzle_migrations`;
  const existingHashes = new Set(existingRows.map((r) => r.hash));
  console.log(`[apply] Journal entries before: ${existingRows.length}`);

  let totalApplied = 0;
  let totalSkippedAlreadyApplied = 0;
  let totalStatementsRun = 0;
  let totalStatementsSkipped = 0;

  for (const file of sqlFiles) {
    const tag = file.replace(/\.sql$/, "");
    const fileContent = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    const fileHash = createHash("sha256").update(fileContent).digest("hex");

    if (existingHashes.has(fileHash)) {
      console.log(`[apply] SKIP ${tag} (already in journal)`);
      totalSkippedAlreadyApplied++;
      continue;
    }

    console.log(`\n[apply] === ${tag} ===`);

    // Splitta su statement-breakpoint
    const statements = fileContent
      .split(/-->\s*statement-breakpoint/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    let stmtIdx = 0;
    let stmtRan = 0;
    let stmtSkipped = 0;
    for (const stmt of statements) {
      stmtIdx++;
      try {
        await sql.unsafe(stmt);
        stmtRan++;
      } catch (err) {
        const code = err?.code ?? "?????";
        if (IGNORABLE_CODES.has(code)) {
          stmtSkipped++;
          const preview = stmt.split("\n")[0].substring(0, 80);
          console.log(`[apply]   stmt ${stmtIdx}: SKIP ${code} ${err.message?.substring(0, 100)} | "${preview}"`);
        } else {
          console.log(`[apply]   stmt ${stmtIdx}: ERROR ${code} ${err.message}`);
          throw err;
        }
      }
    }

    console.log(`[apply]   ${stmtRan}/${statements.length} statements applied (${stmtSkipped} skipped)`);
    totalStatementsRun += stmtRan;
    totalStatementsSkipped += stmtSkipped;

    // Insert journal entry
    const journalEntry = journalByTag.get(tag);
    const createdAt = String(journalEntry?.when ?? Date.now());
    await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
              VALUES (${fileHash}, ${createdAt})`;
    console.log(`[apply]   journal entry inserted (hash=${fileHash.substring(0, 8)})`);
    totalApplied++;
  }

  console.log(`\n[apply] ============================================`);
  console.log(`[apply] Summary:`);
  console.log(`[apply]   Files applied:    ${totalApplied}`);
  console.log(`[apply]   Files skipped:    ${totalSkippedAlreadyApplied} (already in journal)`);
  console.log(`[apply]   Statements run:   ${totalStatementsRun}`);
  console.log(`[apply]   Statements skip:  ${totalStatementsSkipped} (relation/column already exists)`);

  const after = await sql`SELECT COUNT(*) AS c FROM drizzle.__drizzle_migrations`;
  console.log(`[apply]   Journal total:    ${after[0].c}`);
  console.log(`[apply] Done. Restart paperclip — migrations should now be a no-op.`);
} finally {
  await sql.end();
  console.log(`[apply] Stopping postgres...`);
  await pg.stop();
  console.log(`[apply] Postgres stopped.`);
}

#!/usr/bin/env node
/**
 * Pulizia totale dello stato migration:
 *   1. Wipe drizzle.__drizzle_migrations (toglie tutte le entry, anche duplicate)
 *   2. Per ogni .sql in src/migrations/ (ordine alfabetico):
 *      - applica gli statement, ignorando errori "already exists / duplicate column"
 *      - inserisce journal entry con hash corretto e timestamp dal _journal.json
 *   3. Verifica
 *
 * Uso (Paperclip CHIUSO, postgres orfani killati):
 *   node packages/db/rebuild-migration-state.mjs
 */

import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = "D:\\Dropbox\\1_Forex\\Programmazione\\PaperClip";
const DB_DIR = path.join(REPO_ROOT, "instances", "default", "db");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "packages", "db", "src", "migrations");
const PORT = 54329;

// Codici Postgres ignorabili: lo stato è già "in regola" lato schema
const IGNORABLE_CODES = new Set([
  "42P07",  // duplicate_table / index already exists
  "42710",  // duplicate_object (type, constraint)
  "42701",  // duplicate_column
  "42703",  // undefined_column (DROP COLUMN su colonna assente — innocuo)
  "42704",  // undefined_object (DROP IF NOT EXISTS) — innocuo
  "42P16",  // invalid_table_definition
  "42P06",  // duplicate_schema
  "42P01",  // undefined_table (DROP TABLE / drop di FK su tabella assente — innocuo)
]);

console.log(`[rebuild] Repo: ${REPO_ROOT}`);
console.log(`[rebuild] DB dir: ${DB_DIR}`);
console.log(`[rebuild] Migrations: ${MIGRATIONS_DIR}`);

const sqlFiles = (await readdir(MIGRATIONS_DIR))
  .filter((f) => /^\d{4}_.+\.sql$/.test(f))
  .sort();

const journal = JSON.parse(
  await readFile(path.join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
);
const journalByTag = new Map(journal.entries.map((e) => [e.tag, e]));

console.log(`[rebuild] Files: ${sqlFiles.length}`);
console.log(`[rebuild] Journal tags: ${journalByTag.size}`);

const pg = new EmbeddedPostgres({
  databaseDir: DB_DIR,
  user: "paperclip",
  password: "paperclip",
  port: PORT,
  persistent: true,
});

console.log(`[rebuild] Starting embedded postgres on :${PORT}...`);
await pg.start();

const url = `postgres://paperclip:paperclip@127.0.0.1:${PORT}/paperclip`;
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )`;

  const before = await sql`SELECT COUNT(*) AS c FROM drizzle.__drizzle_migrations`;
  console.log(`[rebuild] Journal entries before wipe: ${before[0].c}`);

  // STEP 1: wipe journal
  await sql`TRUNCATE drizzle.__drizzle_migrations RESTART IDENTITY`;
  console.log(`[rebuild] Journal wiped.`);

  // STEP 2: process each migration
  let totalApplied = 0;
  let totalRan = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const file of sqlFiles) {
    const tag = file.replace(/\.sql$/, "");
    const fileContent = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    const fileHash = createHash("sha256").update(fileContent).digest("hex");

    const statements = fileContent
      .split(/-->\s*statement-breakpoint/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    let stmtRan = 0;
    let stmtSkipped = 0;
    let stmtErr = 0;

    for (const stmt of statements) {
      try {
        await sql.unsafe(stmt);
        stmtRan++;
      } catch (err) {
        const code = err?.code ?? "?????";
        if (IGNORABLE_CODES.has(code)) {
          stmtSkipped++;
        } else {
          stmtErr++;
          console.log(`[rebuild]   ${tag} stmt ERROR ${code}: ${err.message?.substring(0, 200)}`);
        }
      }
    }

    if (stmtErr > 0) {
      console.log(`[rebuild] ${tag}: ${stmtRan} ran, ${stmtSkipped} skipped, ${stmtErr} ERRORS — aborting`);
      throw new Error(`Migration ${tag} had ${stmtErr} non-ignorable errors`);
    }

    const journalEntry = journalByTag.get(tag);
    const createdAt = String(journalEntry?.when ?? Date.now());
    await sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
              VALUES (${fileHash}, ${createdAt})`;

    totalApplied++;
    totalRan += stmtRan;
    totalSkipped += stmtSkipped;
    totalErrors += stmtErr;

    if (stmtRan > 0 || stmtSkipped > 0) {
      console.log(`[rebuild] ${tag}: ${stmtRan} new / ${stmtSkipped} preexisting`);
    }
  }

  console.log(`[rebuild] ============================================`);
  console.log(`[rebuild] Files journaled:    ${totalApplied}`);
  console.log(`[rebuild] DDL statements ran: ${totalRan}`);
  console.log(`[rebuild] DDL skipped (existed): ${totalSkipped}`);
  console.log(`[rebuild] Errors: ${totalErrors}`);

  const after = await sql`SELECT COUNT(*) AS c FROM drizzle.__drizzle_migrations`;
  console.log(`[rebuild] Journal entries after: ${after[0].c}`);

  // STEP 3: verify the previously-missing schema
  console.log(`[rebuild] Schema verification:`);
  const checks = [
    { kind: "column", relation: "heartbeat_runs", name: "process_group_id" },
    { kind: "table",  relation: "inbox_dismissals" },
    { kind: "table",  relation: "issue_relations" },
    { kind: "column", relation: "projects", name: "env" },
  ];
  let allOk = true;
  for (const c of checks) {
    const r = c.kind === "column"
      ? await sql`SELECT 1 FROM information_schema.columns
                  WHERE table_name = ${c.relation} AND column_name = ${c.name}`
      : await sql`SELECT 1 FROM information_schema.tables
                  WHERE table_name = ${c.relation}`;
    const ok = r.length > 0;
    if (!ok) allOk = false;
    const target = c.name ? `${c.relation}.${c.name}` : c.relation;
    console.log(`[rebuild]   ${ok ? "OK  " : "MISS"} ${c.kind} ${target}`);
  }

  console.log(allOk
    ? `[rebuild] All checks pass. Restart paperclip.`
    : `[rebuild] WARNING: some schema still missing — investigate.`);
} finally {
  await sql.end();
  console.log(`[rebuild] Stopping postgres...`);
  await pg.stop();
  console.log(`[rebuild] Postgres stopped.`);
}

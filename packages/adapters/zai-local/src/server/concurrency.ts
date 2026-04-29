/**
 * Cross-process concurrency manager for Zai GLM API — Multi-Key Pool.
 *
 * Each API key allows 1 concurrent request. With N keys, N requests
 * can run in parallel. File-based slots (one per key) ensure cross-process
 * safety with randomized jitter to avoid thundering herd.
 *
 * Slot files: ~/.zai-slots/slot-{index} — one per API key in the pool.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SLOTS_DIR = path.join(os.homedir(), ".zai-slots");
const POLL_BASE_MS = 2000;
const POLL_JITTER_MS = 3000;
const MAX_WAIT_MS = 300_000;
const INITIAL_JITTER_MS = 5000;
const STALE_THRESHOLD_MS = 600_000; // 10 minutes

type LogFn = (stream: "stdout" | "stderr", chunk: string) => Promise<void>;

/** Model tier — used for logging and fallback decisions */
export type ModelTier = "paid" | "free";

const FREE_MODELS = new Set(["glm-4.7-flash", "glm-4.5-flash"]);

export function getModelTier(model: string): ModelTier {
  return FREE_MODELS.has(model) ? "free" : "paid";
}

/**
 * Load all API keys from environment.
 * Priority: ZAI_API_KEYS (comma-separated) > ZAI_API_KEY_0..N > ZAI_API_KEY (single)
 */
export function loadApiKeys(envConfig: Record<string, unknown>): string[] {
  const get = (key: string): string =>
    (typeof envConfig[key] === "string" ? (envConfig[key] as string).trim() : "") ||
    (process.env[key] ?? "").trim();

  // 1. Comma-separated pool
  const poolStr = get("ZAI_API_KEYS");
  if (poolStr) {
    const keys = poolStr.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0) return keys;
  }

  // 2. Numbered keys: ZAI_API_KEY_0, ZAI_API_KEY_1, ...
  const numbered: string[] = [];
  for (let i = 0; i < 20; i++) {
    const k = get(`ZAI_API_KEY_${i}`);
    if (k) numbered.push(k);
    else break;
  }
  if (numbered.length > 0) return numbered;

  // 3. Legacy dual-key: ZAI_API_KEY_PAID + ZAI_API_KEY_FREE
  const paid = get("ZAI_API_KEY_PAID");
  const free = get("ZAI_API_KEY_FREE");
  if (paid && free && paid !== free) return [paid, free];
  if (paid) return [paid];
  if (free) return [free];

  // 4. Single universal key
  const single = get("ZAI_API_KEY");
  if (single) return [single];

  return [];
}

function ensureSlotsDir(): void {
  if (!fs.existsSync(SLOTS_DIR)) {
    fs.mkdirSync(SLOTS_DIR, { recursive: true });
  }
}

function slotPath(index: number): string {
  return path.join(SLOTS_DIR, `slot-${index}`);
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tryAcquireSlot(index: number): boolean {
  const fp = slotPath(index);
  try {
    if (fs.existsSync(fp)) {
      const content = fs.readFileSync(fp, "utf8").trim();
      const parts = content.split(":");
      const pid = parseInt(parts[0], 10);
      const ts = parseInt(parts[1] ?? "0", 10);

      if (!isNaN(pid) && isPidAlive(pid)) {
        if (ts > 0 && Date.now() - ts > STALE_THRESHOLD_MS) {
          // Stale — reclaim
        } else {
          return false;
        }
      }
    }

    fs.writeFileSync(fp, `${process.pid}:${Date.now()}`, { mode: 0o644 });
    return true;
  } catch {
    return false;
  }
}

function releaseSlot(index: number): void {
  const fp = slotPath(index);
  try {
    if (fs.existsSync(fp)) {
      const content = fs.readFileSync(fp, "utf8").trim();
      const pid = parseInt(content.split(":")[0], 10);
      if (pid === process.pid) {
        fs.unlinkSync(fp);
      }
    }
  } catch {
    // Best-effort
  }
}

function randomJitter(maxMs: number): number {
  return Math.floor(Math.random() * maxMs);
}

/** Clean up legacy slot files from previous versions */
function cleanupLegacySlots(): void {
  try {
    for (const name of ["slot-0", "slot-paid-0", "slot-free-0"]) {
      const fp = path.join(SLOTS_DIR, name);
      if (fs.existsSync(fp)) {
        const content = fs.readFileSync(fp, "utf8").trim();
        const pid = parseInt(content.split(":")[0], 10);
        if (isNaN(pid) || !isPidAlive(pid)) {
          fs.unlinkSync(fp);
        }
      }
    }
  } catch { /* ignore */ }
}

export interface SlotAcquisition {
  slotIndex: number;
  keyIndex: number;
}

export class ZaiConcurrencyManager {
  private acquiredSlot: number | null = null;
  private poolSize: number;

  constructor(poolSize: number) {
    this.poolSize = Math.max(poolSize, 1);
  }

  /**
   * Acquire a slot from the pool. Returns the slot/key index to use.
   * With N keys, tries slots 0..N-1 in randomized order to spread load.
   */
  async acquire(onLog?: LogFn): Promise<SlotAcquisition> {
    ensureSlotsDir();
    cleanupLegacySlots();

    // Initial jitter to desync heartbeat agents
    const initialDelay = randomJitter(INITIAL_JITTER_MS);
    if (initialDelay > 300) {
      if (onLog) {
        await onLog("stderr", `[zai-pool] Jitter: ${Math.round(initialDelay / 1000)}s (pool: ${this.poolSize} keys)\n`);
      }
      await new Promise((r) => setTimeout(r, initialDelay));
    }

    // Build randomized slot order to avoid all agents hammering slot-0
    const order = Array.from({ length: this.poolSize }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    // First pass: try all slots
    for (const idx of order) {
      if (tryAcquireSlot(idx)) {
        this.acquiredSlot = idx;
        if (onLog) {
          const stats = this.stats();
          await onLog("stderr",
            `[zai-pool] Slot ${idx} acquisito [${stats.active}/${stats.total} in uso]\n`,
          );
        }
        return { slotIndex: idx, keyIndex: idx };
      }
    }

    // All slots taken — poll with jitter
    const startWait = Date.now();
    if (onLog) {
      const stats = this.stats();
      await onLog("stderr",
        `[zai-pool] Tutti gli slot occupati (${stats.active}/${stats.total}), in coda...\n`,
      );
    }

    while (Date.now() - startWait < MAX_WAIT_MS) {
      const waitMs = POLL_BASE_MS + randomJitter(POLL_JITTER_MS);
      await new Promise((r) => setTimeout(r, waitMs));

      for (const idx of order) {
        if (tryAcquireSlot(idx)) {
          this.acquiredSlot = idx;
          if (onLog) {
            const waited = Math.round((Date.now() - startWait) / 1000);
            await onLog("stderr",
              `[zai-pool] Slot ${idx} acquisito dopo ${waited}s\n`,
            );
          }
          return { slotIndex: idx, keyIndex: idx };
        }
      }
    }

    if (onLog) {
      await onLog("stderr",
        `[zai-pool] Timeout (${MAX_WAIT_MS / 1000}s) — nessun slot disponibile\n`,
      );
    }
    throw new Error("zai_slot_timeout");
  }

  release(): void {
    if (this.acquiredSlot !== null) {
      releaseSlot(this.acquiredSlot);
      this.acquiredSlot = null;
    }
  }

  registerCleanup(): void {
    const slot = this.acquiredSlot;
    if (slot !== null) {
      const cleanup = () => releaseSlot(slot);
      process.on("exit", cleanup);
      process.on("SIGTERM", cleanup);
      process.on("SIGINT", cleanup);
    }
  }

  stats(): { active: number; total: number; mySlot: number | null } {
    ensureSlotsDir();
    let active = 0;
    for (let i = 0; i < this.poolSize; i++) {
      const fp = slotPath(i);
      try {
        if (fs.existsSync(fp)) {
          const pid = parseInt(fs.readFileSync(fp, "utf8").trim().split(":")[0], 10);
          if (!isNaN(pid) && isPidAlive(pid)) active++;
        }
      } catch { /* ignore */ }
    }
    return { active, total: this.poolSize, mySlot: this.acquiredSlot };
  }
}

export function createZaiQueue(poolSize: number): ZaiConcurrencyManager {
  return new ZaiConcurrencyManager(poolSize);
}

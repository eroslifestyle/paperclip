import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { notInArray } from "drizzle-orm";
import type { Logger } from "pino";

/**
 * Reasons used when bulk-pausing all agents (system-level, not per-agent user pause).
 * - `system_startup`: server started in safe mode, see `applyStartupSafeMode`
 * - `spend_rate_exceeded`: Spend Guardian detected runaway spend rate
 * - `system`: generic system-initiated pause
 */
export type BulkPauseReason = "system_startup" | "spend_rate_exceeded" | "system";

const NON_PAUSABLE_STATUSES = ["paused", "terminated", "pending_approval"];

/**
 * Bulk-update all agents whose status is not already paused/terminated/pending_approval
 * to status="paused" with the given reason.
 *
 * Returns the number of agents that were paused. Does NOT touch instance settings;
 * the caller is responsible for persisting the user-facing intent flag if needed.
 *
 * Idempotent: running twice in a row pauses zero new agents on the second call.
 */
export async function bulkPauseAllAgents(
  db: Db,
  logger: Logger,
  reason: BulkPauseReason,
): Promise<number> {
  const now = new Date();
  try {
    const updated = await db
      .update(agents)
      .set({
        status: "paused",
        pauseReason: reason,
        pausedAt: now,
        updatedAt: now,
      })
      .where(notInArray(agents.status, NON_PAUSABLE_STATUSES))
      .returning({ id: agents.id });
    logger.info(
      { reason, pausedCount: updated.length },
      `bulk pause: ${updated.length} agent(s) paused (reason=${reason})`,
    );
    return updated.length;
  } catch (err) {
    logger.error({ err, reason }, "bulk pause failed");
    throw err;
  }
}

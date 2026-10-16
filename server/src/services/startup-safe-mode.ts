import type { Db } from "@paperclipai/db";
import type { Logger } from "pino";
import { bulkPauseAllAgents } from "./bulk-pause.js";
import { instanceSettingsService } from "./instance-settings.js";

/**
 * Forces the entire instance into a paused state at server startup.
 *
 * - Bulk-updates every controllable agent to status="paused" with reason="system_startup"
 * - Persists the user-facing intent flag `instance_settings.general.globalPaused = true`
 *
 * The user must explicitly click "Resume All" in the UI header to begin work.
 *
 * Disable for development with env var: PAPERCLIP_STARTUP_SAFE_MODE=false
 */
export async function applyStartupSafeMode(db: Db, logger: Logger): Promise<void> {
  const pausedCount = await bulkPauseAllAgents(db, logger, "system_startup");

  try {
    const settings = instanceSettingsService(db);
    await settings.updateGeneral({ globalPaused: true });
  } catch (err) {
    // Non-fatal: agents are already paused via DB UPDATE above.
    logger.warn(
      { err },
      "startup safe mode: failed to persist globalPaused flag (agents are paused anyway)",
    );
  }

  logger.info(
    { pausedCount },
    `startup safe mode: ${pausedCount} agent(s) paused. Click "Resume All" in the UI header to start work.`,
  );
}

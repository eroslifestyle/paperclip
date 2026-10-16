import type { Db } from "@paperclipai/db";
import type { Logger } from "pino";
import { bulkPauseAllAgents } from "./bulk-pause.js";
import { instanceSettingsService } from "./instance-settings.js";
import { spendSummaryService } from "./spend-summary.js";

export interface SpendGuardianConfig {
  enabled: boolean;
  tickIntervalMs: number;
  maxRatePerMinuteCents: number;
  lookbackMinutes: number;
}

export interface SpendGuardianStatus {
  running: boolean;
  config: SpendGuardianConfig;
  lastTickAt: string | null;
  lastRatePerMinuteCents: number | null;
  totalTicks: number;
  totalAutoPauses: number;
  lastAutoPauseAt: string | null;
}

export interface SpendGuardian {
  start: () => void;
  stop: () => void;
  tickNow: () => Promise<void>;
  getStatus: () => SpendGuardianStatus;
}

/**
 * Background loop that polls the moving spend rate and triggers an instance-wide
 * auto-pause if the rate exceeds the configured threshold.
 *
 * Tick:
 *   1. Compute SpendSummary for the instance (sum across all companies).
 *   2. If `ratePerMinuteCents > maxRatePerMinuteCents`:
 *        - bulkPauseAllAgents(reason="spend_rate_exceeded")
 *        - persist instance_settings.general.globalPaused=true and spendGuardianAutoPaused metadata
 *        - log a WARN
 *   3. Update internal status counters.
 *
 * Disable via env var: PAPERCLIP_SPEND_GUARDIAN_ENABLED=false
 *
 * Configurable via env vars:
 *   PAPERCLIP_SPEND_GUARDIAN_TICK_MS         (default 60000)
 *   PAPERCLIP_SPEND_GUARDIAN_MAX_RATE_CENTS  (default 50 = $0.50/min)
 *   PAPERCLIP_SPEND_GUARDIAN_LOOKBACK_MIN    (default 5)
 */
export function createSpendGuardian(
  db: Db,
  logger: Logger,
  config: SpendGuardianConfig,
): SpendGuardian {
  let timer: NodeJS.Timeout | null = null;
  let tickInProgress = false;
  let lastTickAt: Date | null = null;
  let lastRatePerMinuteCents: number | null = null;
  let totalTicks = 0;
  let totalAutoPauses = 0;
  let lastAutoPauseAt: Date | null = null;

  const summary = spendSummaryService(db, { rateLookbackMinutes: config.lookbackMinutes });

  async function tick(): Promise<void> {
    if (tickInProgress) return;
    tickInProgress = true;
    try {
      const snapshot = await summary.getInstance();
      const rate = snapshot.ratePerMinuteCents;
      lastRatePerMinuteCents = rate;
      lastTickAt = new Date();
      totalTicks += 1;

      if (rate > config.maxRatePerMinuteCents) {
        logger.warn(
          {
            rate,
            threshold: config.maxRatePerMinuteCents,
            lookbackMinutes: config.lookbackMinutes,
            lookbackSpendCents: snapshot.last5MinCents,
            lookbackCalls: snapshot.last5MinCalls,
          },
          `SPEND GUARDIAN auto-pause: rate $${(rate / 100).toFixed(4)}/min > threshold $${(config.maxRatePerMinuteCents / 100).toFixed(4)}/min`,
        );

        const pausedCount = await bulkPauseAllAgents(db, logger, "spend_rate_exceeded");

        try {
          await instanceSettingsService(db).updateGeneral({
            globalPaused: true,
            spendGuardianAutoPaused: {
              triggeredAt: new Date().toISOString(),
              ratePerMinCents: rate,
              thresholdCents: config.maxRatePerMinuteCents,
              lookbackMinutes: config.lookbackMinutes,
            },
          });
        } catch (err) {
          logger.warn(
            { err },
            "spend guardian: failed to persist autoPause metadata (agents already paused)",
          );
        }

        totalAutoPauses += 1;
        lastAutoPauseAt = new Date();
        logger.warn(
          { pausedCount },
          `SPEND GUARDIAN: paused ${pausedCount} agent(s). Click "Resume All" in the UI header to clear.`,
        );
      }
    } catch (err) {
      logger.error({ err }, "spend guardian tick failed");
    } finally {
      tickInProgress = false;
    }
  }

  return {
    start: () => {
      if (!config.enabled) {
        logger.warn("spend guardian: DISABLED via PAPERCLIP_SPEND_GUARDIAN_ENABLED=false");
        return;
      }
      if (timer) return;
      logger.info(
        {
          tickIntervalMs: config.tickIntervalMs,
          maxRatePerMinuteCents: config.maxRatePerMinuteCents,
          lookbackMinutes: config.lookbackMinutes,
        },
        `spend guardian: started (threshold $${(config.maxRatePerMinuteCents / 100).toFixed(4)}/min over ${config.lookbackMinutes}min lookback, tick every ${config.tickIntervalMs}ms)`,
      );
      timer = setInterval(() => void tick(), config.tickIntervalMs);
    },
    stop: () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      logger.info("spend guardian: stopped");
    },
    tickNow: tick,
    getStatus: () => ({
      running: timer !== null,
      config,
      lastTickAt: lastTickAt?.toISOString() ?? null,
      lastRatePerMinuteCents,
      totalTicks,
      totalAutoPauses,
      lastAutoPauseAt: lastAutoPauseAt?.toISOString() ?? null,
    }),
  };
}

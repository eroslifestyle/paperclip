import type { Db } from "@paperclipai/db";
import { costEvents } from "@paperclipai/db";
import { and, eq, gte, sql } from "drizzle-orm";
import type { SpendSummary } from "@paperclipai/shared";

const MS_PER_MIN = 60_000;

function sumCents() {
  return sql<number>`coalesce(sum(${costEvents.costCents}), 0)::double precision`;
}
function countCalls() {
  return sql<number>`count(*)::double precision`;
}

interface WindowRow {
  cents: number;
  calls: number;
}

async function spendSince(
  db: Db,
  since: Date,
  companyId: string | null,
): Promise<WindowRow> {
  const conditions = [gte(costEvents.occurredAt, since)];
  if (companyId) conditions.push(eq(costEvents.companyId, companyId));
  const [row] = await db
    .select({ cents: sumCents(), calls: countCalls() })
    .from(costEvents)
    .where(and(...conditions));
  return {
    cents: Number(row?.cents ?? 0),
    calls: Number(row?.calls ?? 0),
  };
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface SpendSummaryServiceOptions {
  /** Lookback window used to compute the moving spend rate. Default 5 minutes. */
  rateLookbackMinutes?: number;
}

export function spendSummaryService(db: Db, opts: SpendSummaryServiceOptions = {}) {
  const lookbackMinutes = Math.max(1, opts.rateLookbackMinutes ?? 5);

  async function compute(companyId: string | null): Promise<SpendSummary> {
    const now = new Date();
    const oneMinAgo = new Date(now.getTime() - 1 * MS_PER_MIN);
    const lookbackAgo = new Date(now.getTime() - lookbackMinutes * MS_PER_MIN);
    const oneHourAgo = new Date(now.getTime() - 60 * MS_PER_MIN);
    const dayStart = startOfUtcDay(now);
    const monthStart = startOfUtcMonth(now);

    const [oneMin, lookback, oneHour, today, month] = await Promise.all([
      spendSince(db, oneMinAgo, companyId),
      spendSince(db, lookbackAgo, companyId),
      spendSince(db, oneHourAgo, companyId),
      spendSince(db, dayStart, companyId),
      spendSince(db, monthStart, companyId),
    ]);

    return {
      companyId,
      computedAt: now.toISOString(),
      lastMinuteCents: oneMin.cents,
      last5MinCents: lookback.cents,
      lastHourCents: oneHour.cents,
      todayCents: today.cents,
      monthCents: month.cents,
      lastMinuteCalls: oneMin.calls,
      last5MinCalls: lookback.calls,
      lastHourCalls: oneHour.calls,
      todayCalls: today.calls,
      monthCalls: month.calls,
      ratePerMinuteCents: lookback.cents / lookbackMinutes,
    };
  }

  return {
    /** Instance-wide snapshot (all companies summed). */
    getInstance: () => compute(null),
    /** Per-company snapshot. */
    getForCompany: (companyId: string) => compute(companyId),
    /** Effective lookback window in minutes used for `ratePerMinuteCents`. */
    lookbackMinutes,
  };
}

import type { SpendSummary } from "@paperclipai/shared";
import { api } from "./client";

export interface SpendGuardianStatus {
  available: boolean;
  running?: boolean;
  config?: {
    enabled: boolean;
    tickIntervalMs: number;
    maxRatePerMinuteCents: number;
    lookbackMinutes: number;
  };
  lastTickAt?: string | null;
  lastRatePerMinuteCents?: number | null;
  totalTicks?: number;
  totalAutoPauses?: number;
  lastAutoPauseAt?: string | null;
}

export const adminSpendApi = {
  getSummary: () => api.get<SpendSummary>("/admin/spend-summary"),
  getCompanySummary: (companyId: string) =>
    api.get<SpendSummary>(`/admin/spend-summary/companies/${companyId}`),
  getGuardianStatus: () =>
    api.get<SpendGuardianStatus>("/admin/spend-guardian/status"),
  guardianTickNow: () =>
    api.post<{ ok: true; status: SpendGuardianStatus }>(
      "/admin/spend-guardian/tick-now",
      {},
    ),
};

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Loader2, ShieldAlert, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { adminSpendApi } from "@/api/adminSpend";
import { instanceSettingsApi } from "@/api/instanceSettings";

const SPEND_QUERY_KEY = ["admin", "spend-summary"] as const;
const GUARDIAN_QUERY_KEY = ["admin", "spend-guardian", "status"] as const;
const SETTINGS_QUERY_KEY = ["instance", "general-settings"] as const;

function fmtCents(cents: number): string {
  if (!Number.isFinite(cents)) return "—";
  if (cents < 1) return `$${cents.toFixed(3)}`;
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtRate(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return "$0.00/min";
  if (cents < 1) return `$${cents.toFixed(3)}/min`;
  return `$${(cents / 100).toFixed(4)}/min`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export function SpendBadge() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const summaryQuery = useQuery({
    queryKey: SPEND_QUERY_KEY,
    queryFn: () => adminSpendApi.getSummary(),
    refetchInterval: 15_000,
  });

  const guardianQuery = useQuery({
    queryKey: GUARDIAN_QUERY_KEY,
    queryFn: () => adminSpendApi.getGuardianStatus(),
    refetchInterval: 30_000,
    enabled: open, // poll status only when modal is open (saves cycles)
  });

  const settingsQuery = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => instanceSettingsApi.getGeneral(),
    refetchInterval: 30_000,
  });

  const tickNowMutation = useMutation({
    mutationFn: () => adminSpendApi.guardianTickNow(),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: SPEND_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: GUARDIAN_QUERY_KEY }),
        qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
      ]);
    },
  });

  const summary = summaryQuery.data;
  const guardian = guardianQuery.data;
  const settings = settingsQuery.data;

  // Threshold computation. If guardian is reachable, use its config; else fallback to 50 cents/min.
  const thresholdCents = guardian?.config?.maxRatePerMinuteCents ?? 50;
  const ratePerMinCents = summary?.ratePerMinuteCents ?? 0;
  const ratioOfThreshold = thresholdCents > 0 ? ratePerMinCents / thresholdCents : 0;

  // Color of the badge based on ratio.
  const variant: "default" | "destructive" | "secondary" | "outline" = useMemo(() => {
    if (settings?.spendGuardianAutoPaused) return "destructive";
    if (ratioOfThreshold >= 0.8) return "destructive";
    if (ratioOfThreshold >= 0.5) return "secondary";
    return "outline";
  }, [settings?.spendGuardianAutoPaused, ratioOfThreshold]);

  const autoPauseInfo = settings?.spendGuardianAutoPaused;

  const tooltipText = autoPauseInfo
    ? `AUTO-PAUSED dal Spend Guardian: rate ${fmtRate(autoPauseInfo.ratePerMinCents)} > soglia ${fmtRate(autoPauseInfo.thresholdCents)} alle ${fmtTime(autoPauseInfo.triggeredAt)}`
    : `Spend oggi: ${fmtCents(summary?.todayCents ?? 0)} | rate ${fmtRate(ratePerMinCents)} | soglia auto-pause ${fmtRate(thresholdCents)}`;

  return (
    <TooltipProvider delayDuration={200}>
      <Dialog open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant={variant === "destructive" ? "destructive" : "outline"}
                size="sm"
                className="ml-2 shrink-0 gap-1.5"
                disabled={summaryQuery.isLoading}
              >
                {autoPauseInfo ? (
                  <ShieldAlert className="h-4 w-4" />
                ) : summaryQuery.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <DollarSign className="h-4 w-4" />
                )}
                <span className="hidden md:inline tabular-nums">
                  {fmtCents(summary?.todayCents ?? 0)}
                </span>
                {ratePerMinCents > 0 && (
                  <Badge
                    variant={variant}
                    className="ml-0.5 px-1.5 py-0 h-5 text-xs font-medium tabular-nums"
                  >
                    {fmtRate(ratePerMinCents)}
                  </Badge>
                )}
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className={autoPauseInfo ? "text-destructive" : ""}>{tooltipText}</p>
          </TooltipContent>
        </Tooltip>

        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Spend Guardian
            </DialogTitle>
            <DialogDescription>
              Real-time token spend monitor + auto-pause se rate supera soglia
            </DialogDescription>
          </DialogHeader>

          {autoPauseInfo && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3">
              <div className="flex items-start gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-destructive">
                    Sistema auto-pausato dal Spend Guardian
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Triggered: {fmtTime(autoPauseInfo.triggeredAt)}
                    <br />
                    Rate misurato: <span className="font-mono">{fmtRate(autoPauseInfo.ratePerMinCents)}</span>
                    <br />
                    Soglia: <span className="font-mono">{fmtRate(autoPauseInfo.thresholdCents)}</span>
                    <br />
                    Lookback window: {autoPauseInfo.lookbackMinutes} min
                  </p>
                  <p className="text-xs text-muted-foreground pt-1">
                    Per ripartire: clicca il pulsante <strong>Resume All</strong> qui nel header.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="rounded-md border p-3 space-y-2">
              <h3 className="text-sm font-semibold">Spend (centesimi)</h3>
              <dl className="text-xs space-y-1 tabular-nums">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Ultimo minuto:</dt>
                  <dd className="font-mono">{fmtCents(summary?.lastMinuteCents ?? 0)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Ultimi 5 min:</dt>
                  <dd className="font-mono">{fmtCents(summary?.last5MinCents ?? 0)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Ultima ora:</dt>
                  <dd className="font-mono">{fmtCents(summary?.lastHourCents ?? 0)}</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>Oggi:</dt>
                  <dd className="font-mono">{fmtCents(summary?.todayCents ?? 0)}</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>Mese corrente:</dt>
                  <dd className="font-mono">{fmtCents(summary?.monthCents ?? 0)}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <h3 className="text-sm font-semibold">Chiamate LLM</h3>
              <dl className="text-xs space-y-1 tabular-nums">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Ultimo minuto:</dt>
                  <dd className="font-mono">{summary?.lastMinuteCalls ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Ultimi 5 min:</dt>
                  <dd className="font-mono">{summary?.last5MinCalls ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Ultima ora:</dt>
                  <dd className="font-mono">{summary?.lastHourCalls ?? 0}</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>Oggi:</dt>
                  <dd className="font-mono">{summary?.todayCalls ?? 0}</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>Mese corrente:</dt>
                  <dd className="font-mono">{summary?.monthCalls ?? 0}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-2 mt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Spend Guardian (background)</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => tickNowMutation.mutate()}
                disabled={!guardian?.available || tickNowMutation.isPending}
              >
                {tickNowMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : null}
                Tick now
              </Button>
            </div>
            {guardian?.available ? (
              <dl className="text-xs space-y-1 tabular-nums">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Status:</dt>
                  <dd className="font-mono">
                    {guardian.running ? (
                      <span className="text-green-600">running</span>
                    ) : (
                      <span className="text-muted-foreground">stopped</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Soglia rate:</dt>
                  <dd className="font-mono">{fmtRate(guardian.config?.maxRatePerMinuteCents ?? 0)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Lookback:</dt>
                  <dd className="font-mono">{guardian.config?.lookbackMinutes ?? 0} min</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tick interval:</dt>
                  <dd className="font-mono">{((guardian.config?.tickIntervalMs ?? 0) / 1000).toFixed(0)}s</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total ticks:</dt>
                  <dd className="font-mono">{guardian.totalTicks ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total auto-pauses:</dt>
                  <dd className="font-mono">{guardian.totalAutoPauses ?? 0}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Last tick:</dt>
                  <dd className="font-mono">{fmtTime(guardian.lastTickAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Last rate misurato:</dt>
                  <dd className="font-mono">
                    {guardian.lastRatePerMinuteCents !== null && guardian.lastRatePerMinuteCents !== undefined
                      ? fmtRate(guardian.lastRatePerMinuteCents)
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Last auto-pause:</dt>
                  <dd className="font-mono">{fmtTime(guardian.lastAutoPauseAt)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-muted-foreground">
                Spend Guardian non disponibile (server non lo espone).
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            Computed: {fmtTime(summary?.computedAt)} • refresh ogni 15s
          </p>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

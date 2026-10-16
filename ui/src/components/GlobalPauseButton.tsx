import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCompany } from "../context/CompanyContext";
import { agentsApi } from "@/api/agents";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { queryKeys } from "@/lib/queryKeys";

const NON_CONTROLLABLE_STATUSES = new Set(["terminated", "pending_approval"]);

export function GlobalPauseButton() {
  const { selectedCompanyId } = useCompany();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const agentsQuery = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.agents.list(selectedCompanyId)
      : ["agents", "none"],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
  });

  const settingsQuery = useQuery({
    queryKey: queryKeys.instance.generalSettings,
    queryFn: () => instanceSettingsApi.getGeneral(),
    refetchInterval: 30_000,
  });

  const agents = agentsQuery.data ?? [];
  const controllable = agents.filter(
    (a) => !NON_CONTROLLABLE_STATUSES.has(a.status),
  );
  const totalControllable = controllable.length;
  const pausedCount = controllable.filter((a) => a.status === "paused").length;
  const intentPaused = settingsQuery.data?.globalPaused === true;
  const allPaused = totalControllable > 0 && pausedCount === totalControllable;
  const inTransition = pausedCount > 0 && pausedCount < totalControllable;

  const pauseAllMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Nessuna company selezionata");
      const targets = controllable.filter((a) => a.status !== "paused");
      const results = await Promise.allSettled(
        targets.map((a) => agentsApi.pause(a.id, selectedCompanyId)),
      );
      try {
        await instanceSettingsApi.updateGeneral({ globalPaused: true });
      } catch {
        // best-effort: il pulsante continua a funzionare anche se la persistenza fallisce
      }
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        throw new Error(
          `Pausa parziale: ${failures.length} di ${targets.length} agent non sono in pausa`,
        );
      }
      return targets.length;
    },
    onSuccess: async () => {
      setError(null);
      await Promise.all([
        qc.invalidateQueries({
          queryKey: queryKeys.agents.list(selectedCompanyId!),
        }),
        qc.invalidateQueries({ queryKey: queryKeys.instance.generalSettings }),
      ]);
    },
    onError: (e: Error) => setError(e.message),
  });

  const resumeAllMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Nessuna company selezionata");
      const targets = controllable.filter((a) => a.status === "paused");
      const results = await Promise.allSettled(
        targets.map((a) => agentsApi.resume(a.id, selectedCompanyId)),
      );
      try {
        await instanceSettingsApi.updateGeneral({ globalPaused: false });
      } catch {
        // best-effort
      }
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        throw new Error(
          `Resume parziale: ${failures.length} di ${targets.length} agent non sono ripartiti`,
        );
      }
      return targets.length;
    },
    onSuccess: async () => {
      setError(null);
      await Promise.all([
        qc.invalidateQueries({
          queryKey: queryKeys.agents.list(selectedCompanyId!),
        }),
        qc.invalidateQueries({ queryKey: queryKeys.instance.generalSettings }),
      ]);
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!selectedCompanyId) return null;

  const isPending =
    pauseAllMutation.isPending || resumeAllMutation.isPending;
  const showResume = allPaused || (intentPaused && pausedCount > 0);

  const handleClick = () => {
    if (isPending) return;
    if (showResume) {
      const n = controllable.filter((a) => a.status === "paused").length;
      if (!window.confirm(`Riavviare ${n} agent in pausa?`)) return;
      resumeAllMutation.mutate();
    } else {
      const n = controllable.filter((a) => a.status !== "paused").length;
      if (
        !window.confirm(
          `Mettere in pausa ${n} agent attivi? I run in corso verranno killati con SIGTERM.`,
        )
      )
        return;
      pauseAllMutation.mutate();
    }
  };

  const badgeVariant: "default" | "destructive" | "secondary" | "outline" =
    allPaused ? "destructive" : inTransition ? "secondary" : "outline";

  const autoPauseInfo = settingsQuery.data?.spendGuardianAutoPaused;
  const autoPauseLine = autoPauseInfo
    ? `Auto-paused dal Spend Guardian: rate $${(autoPauseInfo.ratePerMinCents / 100).toFixed(4)}/min > soglia $${(autoPauseInfo.thresholdCents / 100).toFixed(4)}/min. `
    : "";

  const tooltipText = error
    ? error
    : showResume
      ? `${autoPauseLine}Riavvia tutti gli agent in pausa della company corrente (${pausedCount})`
      : `Mette in pausa tutti gli agent attivi della company corrente. Termina i run in corso.`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={showResume ? "default" : "outline"}
            size="sm"
            onClick={handleClick}
            disabled={isPending || agentsQuery.isLoading || totalControllable === 0}
            className="ml-2 shrink-0 gap-1.5"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : showResume ? (
              <Play className="h-4 w-4" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {isPending
                ? showResume
                  ? "Resuming…"
                  : "Pausing…"
                : showResume
                  ? "Resume All"
                  : "Pause All"}
            </span>
            {totalControllable > 0 && (
              <Badge
                variant={badgeVariant}
                className="ml-0.5 px-1.5 py-0 h-5 text-xs font-medium"
              >
                {pausedCount}/{totalControllable}
              </Badge>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className={error ? "text-destructive" : ""}>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

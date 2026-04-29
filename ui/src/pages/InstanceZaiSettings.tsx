import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap, CheckCircle2, XCircle, Loader2, ExternalLink, Settings } from "lucide-react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { api } from "@/api/client";

interface ZaiStatus {
  connected: boolean;
  hasApiKey: boolean;
  hasEnvKey: boolean;
  keyPreview?: string;
  envKeyPreview?: string;
  keyPath: string;
  defaultModel?: string;
}

interface TestResponse {
  success: boolean;
  message?: string;
  error?: string;
}

const zaiQueryKey = ["instance", "settings", "zai", "status"];

const ZAI_MODELS = [
  {
    id: "glm-5.1",
    name: "GLM-5.1",
    description: "Flagship model with 200K context",
    inputPrice: 1.40,
    outputPrice: 4.40,
    tier: "paid" as const,
  },
  {
    id: "glm-4.7",
    name: "GLM-4.7",
    description: "Standard model",
    inputPrice: 0.50,
    outputPrice: 1.50,
    tier: "paid" as const,
  },
  {
    id: "glm-4.7-flash",
    name: "GLM-4.7 Flash",
    description: "Fast free model",
    inputPrice: 0,
    outputPrice: 0,
    tier: "free" as const,
  },
  {
    id: "glm-4.5-flash",
    name: "GLM-4.5 Flash",
    description: "Basic free model",
    inputPrice: 0,
    outputPrice: 0,
    tier: "free" as const,
  },
];

export function InstanceZaiSettings() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [saveResult, setSaveResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [testResult, setTestResult] = useState<TestResponse | null>(null);
  const [selectedModel, setSelectedModel] = useState("glm-4.7");

  useEffect(() => {
    setBreadcrumbs([
      { label: "Instance Settings" },
      { label: "Zai GLM API" },
    ]);
  }, [setBreadcrumbs]);

  const statusQuery = useQuery({
    queryKey: zaiQueryKey,
    queryFn: () => api.get<ZaiStatus>("/instance/settings/zai/status"),
    refetchInterval: 120_000,
  });

  const status = statusQuery.data;
  const isConnected = status?.connected === true;

  useEffect(() => {
    if (status?.defaultModel) {
      setSelectedModel(status.defaultModel);
    }
  }, [status]);

  const saveApiKeyMutation = useMutation({
    mutationFn: (key: string) =>
      api.post<{ success: boolean; message?: string; error?: string }>("/instance/settings/zai/api-key", { apiKey: key }),
    onSuccess: async (data) => {
      setSaveResult(data);
      setApiKeyInput("");
      await queryClient.invalidateQueries({ queryKey: zaiQueryKey });
    },
    onError: (err) => {
      setSaveResult({ success: false, error: err instanceof Error ? err.message : "Errore" });
    },
  });

  const removeApiKeyMutation = useMutation({
    mutationFn: () => api.delete("/instance/settings/zai/api-key"),
    onSuccess: async () => {
      setSaveResult(null);
      setTestResult(null);
      await queryClient.invalidateQueries({ queryKey: zaiQueryKey });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => api.post<TestResponse>("/instance/settings/zai/test", {}),
    onSuccess: (data) => setTestResult(data),
    onError: (err) => {
      setTestResult({ success: false, error: err instanceof Error ? err.message : "Test fallito" });
    },
  });

  const updateModelMutation = useMutation({
    mutationFn: (model: string) =>
      api.post<{ success: boolean; message?: string; error?: string }>("/instance/settings/zai/default-model", { model }),
    onSuccess: async (data) => {
      if (data.success) {
        await queryClient.invalidateQueries({ queryKey: zaiQueryKey });
      }
    },
  });

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Zai GLM API</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Gestisci la API key per l'adapter Zai GLM-5. L'autenticazione avviene tramite API key
          ottenibile dal portale Z.AI.
        </p>
      </div>

      {/* Connection Status Card */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Stato Connessione</h2>
          {statusQuery.isLoading ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Caricamento...
            </span>
          ) : isConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Connesso
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-red-500 font-medium">
              <XCircle className="h-3.5 w-3.5" /> Non connesso
            </span>
          )}
        </div>

        {status && (
          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">API Key salvata:</span>{" "}
              {status.hasApiKey ? "Si'" : "No"}
            </div>
            <div>
              <span className="font-medium text-foreground">Env Key:</span>{" "}
              {status.hasEnvKey ? "Presente" : "Assente"}
            </div>
            {(status.keyPreview || status.envKeyPreview) && (
              <div className="col-span-2">
                <span className="font-medium text-foreground">Key attiva:</span>{" "}
                <code className="text-[10px] bg-muted px-1 py-0.5 rounded">
                  {status.keyPreview ?? status.envKeyPreview}
                </code>
              </div>
            )}
            <div className="col-span-2">
              <span className="font-medium text-foreground">File:</span>{" "}
              <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{status.keyPath}</code>
            </div>
          </div>
        )}
      </section>

      {/* API Key Card */}
      <section className="rounded-xl border border-blue-500/30 bg-card p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Zai API Key</h2>
          <p className="text-xs text-muted-foreground">
            Ottieni una API key da{" "}
            <a
              href="https://z.ai/chat"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline inline-flex items-center gap-0.5"
            >
              z.ai/chat <ExternalLink className="h-3 w-3" />
            </a>{" "}
            {">"} Profilo {">"} API Keys. I modelli GLM-4.5 Flash e GLM-4.7 Flash sono gratuiti.
          </p>
        </div>

        {(status?.hasApiKey || status?.hasEnvKey) && (
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Key configurata
            </span>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
              {status.keyPreview ?? status.envKeyPreview}
            </code>
            {status.hasApiKey && (
              <button
                onClick={() => removeApiKeyMutation.mutate()}
                className="text-xs text-red-500 hover:underline"
              >
                Rimuovi
              </button>
            )}
            {status.hasEnvKey && !status.hasApiKey && (
              <span className="text-xs text-muted-foreground">(da variabile d'ambiente)</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="password"
            placeholder="Inserisci la tua Zai API Key..."
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          <button
            onClick={() => saveApiKeyMutation.mutate(apiKeyInput)}
            disabled={apiKeyInput.trim().length < 10 || saveApiKeyMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saveApiKeyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salva e Testa
          </button>
        </div>

        {saveResult && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              saveResult.success
                ? "border-emerald-300/50 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300"
                : "border-red-300/50 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300"
            }`}
          >
            {saveResult.success ? saveResult.message : saveResult.error}
          </div>
        )}
      </section>

      {/* Model Selector Card */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Modello Predefinito</h2>
          <p className="text-xs text-muted-foreground">
            Seleziona il modello GLM da utilizzare per gli agenti. I modelli gratuiti sono consigliati per task semplici.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ZAI_MODELS.map((model) => (
            <button
              key={model.id}
              onClick={() => {
                setSelectedModel(model.id);
                updateModelMutation.mutate(model.id);
              }}
              disabled={updateModelMutation.isPending || !isConnected}
              className={`rounded-lg border p-3 text-left transition-colors ${
                selectedModel === model.id
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                  : "border-border hover:border-border/80 hover:bg-accent"
              } disabled:opacity-50`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">{model.name}</span>
                {model.tier === "free" && (
                  <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded">
                    Gratis
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{model.description}</p>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>Input: ${model.inputPrice}/1M</span>
                <span>•</span>
                <span>Output: ${model.outputPrice}/1M</span>
              </div>
            </button>
          ))}
        </div>

        {updateModelMutation.isSuccess && (
          <div className="rounded-lg border border-emerald-300/50 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            Modello predefinito aggiornato con successo.
          </div>
        )}
      </section>

      {/* Test Connection Card */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold">Test Connessione</h2>

        <div className="flex items-center gap-3">
          <button
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending || !isConnected}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50 transition-colors"
          >
            {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Testa Connessione
          </button>
        </div>

        {testResult && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              testResult.success
                ? "border-emerald-300/50 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300"
                : "border-red-300/50 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300"
            }`}
          >
            <p className="flex items-center gap-2 font-medium">
              {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {testResult.success ? testResult.message : testResult.error}
            </p>
          </div>
        )}
      </section>

      {/* Pricing Info */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Modelli e Prezzi</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="pb-2 pr-4">Modello</th>
                <th className="pb-2 pr-4">Input $/1M tok</th>
                <th className="pb-2 pr-4">Output $/1M tok</th>
                <th className="pb-2">Note</th>
              </tr>
            </thead>
            <tbody className="text-foreground">
              <tr className="border-b border-border/50"><td className="py-1.5 pr-4 font-medium">GLM-5.1</td><td className="py-1.5 pr-4">$1.40</td><td className="py-1.5 pr-4">$4.40</td><td className="py-1.5">Flagship, 200K ctx</td></tr>
              <tr className="border-b border-border/50"><td className="py-1.5 pr-4 font-medium">GLM-5</td><td className="py-1.5 pr-4">$0.72</td><td className="py-1.5 pr-4">$2.30</td><td className="py-1.5">Default</td></tr>
              <tr className="border-b border-border/50"><td className="py-1.5 pr-4 font-medium">GLM-5 Turbo</td><td className="py-1.5 pr-4">$1.20</td><td className="py-1.5 pr-4">$4.00</td><td className="py-1.5"></td></tr>
              <tr className="border-b border-border/50"><td className="py-1.5 pr-4 font-medium">GLM-4.7 Flash</td><td className="py-1.5 pr-4">$0</td><td className="py-1.5 pr-4">$0</td><td className="py-1.5 text-emerald-600 font-medium">Gratuito</td></tr>
              <tr><td className="py-1.5 pr-4 font-medium">GLM-4.5 Flash</td><td className="py-1.5 pr-4">$0</td><td className="py-1.5 pr-4">$0</td><td className="py-1.5 text-emerald-600 font-medium">Gratuito</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

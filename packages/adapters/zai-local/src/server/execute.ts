import fs from "node:fs/promises";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  asBoolean,
  asNumber,
  asString,
  buildPaperclipEnv,
  parseObject,
  renderTemplate,
  joinPromptSections,
} from "@paperclipai/adapter-utils/server-utils";

function renderPaperclipWakePrompt(wake: unknown, _opts: { resumedSession: boolean }): string {
  if (!wake || typeof wake !== "object") return "";
  const w = wake as Record<string, unknown>;
  if (typeof w.prompt === "string" && w.prompt.trim()) return w.prompt.trim();
  return "";
}
import { DEFAULT_ZAI_MODEL, ZAI_API_BASE_URL } from "../index.js";
import { createZaiQueue, getModelTier, loadApiKeys } from "./concurrency.js";
import {
  analyzeTask,
  createExecutionPlan,
  executeHierarchically,
  parseHierarchyConfig,
  type HierarchyConfig
} from "./hierarchy.js";

/**
 * Model fallback chain: when the primary model is rate-limited after
 * MAX_RETRIES_BEFORE_FALLBACK attempts, drop to the next cheaper/free model.
 */
const MODEL_FALLBACK_CHAIN: Record<string, string> = {
  "glm-5.1": "glm-4.7",
  "glm-5": "glm-4.7",
  "glm-5-turbo": "glm-4.7",
  "glm-4.7": "glm-4.7-flash",
  "glm-4.6": "glm-4.7-flash",
  "glm-4.5": "glm-4.5-flash",
  "glm-4.5-air": "glm-4.5-flash",
};
const MAX_RETRIES_BEFORE_FALLBACK = 3;

/** GLM pricing per million tokens (USD) */
const PRICING: Record<string, { input: number; output: number }> = {
  "glm-5.1": { input: 1.40, output: 4.40 },
  "glm-5": { input: 0.72, output: 2.30 },
  "glm-5-turbo": { input: 1.20, output: 4.00 },
  "glm-4.7": { input: 0.50, output: 1.50 },
  "glm-4.7-flash": { input: 0, output: 0 },
  "glm-4.6": { input: 0.50, output: 1.50 },
  "glm-4.5": { input: 0.30, output: 0.60 },
  "glm-4.5-flash": { input: 0, output: 0 },
  "glm-4.5-air": { input: 0.15, output: 0.30 },
};

/**
 * Analyze task complexity to determine appropriate AI provider
 */
async function analyzeTaskComplexity(prompt: string): Promise<"low" | "medium" | "high" | "vision" | "strategy"> {
  const promptLower = prompt.toLowerCase();

  // Check for vision requirements
  if (promptLower.includes("image") ||
      promptLower.includes("screenshot") ||
      promptLower.includes("visual") ||
      promptLower.includes("diagram") ||
      promptLower.includes("chart")) {
    return "vision";
  }

  // Check for strategic/complex requirements
  if (promptLower.includes("architecture") ||
      promptLower.includes("strategy") ||
      promptLower.includes("design") ||
      promptLower.includes("analyze") ||
      promptLower.includes("research") ||
      promptLower.length > 2000) {
    return "strategy";
  }

  // Check for medium complexity
  if (promptLower.includes("implement") ||
      promptLower.includes("feature") ||
      promptLower.includes("refactor") ||
      promptLower.length > 1000) {
    return "medium";
  }

  // Default to low complexity
  return "low";
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model] ?? PRICING[DEFAULT_ZAI_MODEL]!;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta } = ctx;

  const model = asString(config.model, DEFAULT_ZAI_MODEL).trim();
  const thinking = asBoolean(config.thinking, true);
  const maxTokens = asNumber(config.maxTokens, 4096);
  const temperature = asNumber(config.temperature, 0.6);
  const stream = asBoolean(config.stream, true);
  const timeoutSec = asNumber(config.timeoutSec, 300);
  const systemPrompt = asString(config.systemPrompt, "").trim();

  // AI Provider Selection
  const aiProvider = asString(config.aiProvider, "zai_glm").trim(); // zai_glm, claude, automatic
  const aiModel = asString(config.aiModel, "").trim(); // Specific model if manual
  const providerMode = asString(config.providerMode, "manual").trim(); // manual, automatic

  // Determine the actual provider and model to use
  let selectedProvider = aiProvider;
  let selectedModel = aiModel;

  if (aiProvider === "automatic") {
    // Auto-select based on task complexity
    const promptText = renderPaperclipWakePrompt(context.paperclipWake, { resumedSession: false }) +
                       (config.promptTemplate ? renderTemplate(asString(config.promptTemplate, ""), {
                         agentId: agent.id,
                         companyId: agent.companyId,
                         runId,
                         company: { id: agent.companyId },
                         agent,
                         run: { id: runId, source: "on_demand" },
                         context
                       }) : "");

    const taskComplexity = await analyzeTaskComplexity(promptText);

    if (taskComplexity === "high" || taskComplexity === "vision" || taskComplexity === "strategy") {
      selectedProvider = "claude";
      selectedModel = aiModel || "claude-3-opus-20240229";
    } else if (taskComplexity === "medium") {
      selectedProvider = "claude";
      selectedModel = aiModel || "claude-3-sonnet-20240229";
    } else {
      selectedProvider = "zai_glm";
      selectedModel = aiModel || "glm-4.7-flash";
    }
  } else if (aiProvider === "claude" && !aiModel) {
    // Default Claude model if not specified
    selectedModel = "claude-3-sonnet-20240229";
  } else if (aiProvider === "zai_glm" && !aiModel) {
    // Default ZAI model if not specified
    selectedModel = DEFAULT_ZAI_MODEL;
  }

  // Check if hierarchical execution is enabled
  const hierarchyConfig = parseHierarchyConfig(config);
  if (hierarchyConfig.enableHierarchy) {
    await onLog("stdout", JSON.stringify({
      type: "system",
      subtype: "hierarchy_start",
      enabled: true,
      provider: selectedProvider,
      model: selectedModel,
      ts: new Date().toISOString(),
    }) + "\n");

    // Analyze the task to determine execution strategy
    const taskPrompt = renderPaperclipWakePrompt(context.paperclipWake, { resumedSession: false }) +
                      (config.promptTemplate ? renderTemplate(asString(config.promptTemplate, ""), {
                        agentId: agent.id,
                        companyId: agent.companyId,
                        runId,
                        company: { id: agent.companyId },
                        agent,
                        run: { id: runId, source: "on_demand" },
                        context
                      }) : "");

    const analysis = await analyzeTask(taskPrompt, context, hierarchyConfig);
    const plan = createExecutionPlan(analysis, hierarchyConfig);

    // Update plan to use the selected provider/model
    plan.steps.forEach(step => {
      if (selectedProvider === "claude") {
        step.model = selectedModel;
        if (step.executor === "glm") {
          step.executor = "sonnet"; // Map GLM to Sonnet for Claude
        }
      }
    });

    await onLog("stdout", JSON.stringify({
      type: "system",
      subtype: "hierarchy_plan",
      complexity: analysis.complexity,
      steps: plan.steps.length,
      estimatedDuration: plan.totalEstimatedDuration,
      provider: selectedProvider,
      model: selectedModel,
      ts: new Date().toISOString(),
    }) + "\n");

    // Execute hierarchically
    const result = await executeHierarchically(
      ctx,
      plan,
      hierarchyConfig,
      (step) => {
        onLog("stdout", JSON.stringify({
          type: "system",
          subtype: "hierarchy_step_start",
          step: step.id,
          executor: step.executor,
          model: step.model,
          provider: selectedProvider,
          ts: new Date().toISOString(),
        }) + "\n");
      },
      (step, stepResult) => {
        onLog("stdout", JSON.stringify({
          type: "system",
          subtype: "hierarchy_step_complete",
          step: step.id,
          executor: step.executor,
          success: stepResult.exitCode === 0,
          duration: step.estimatedDuration,
          provider: selectedProvider,
          ts: new Date().toISOString(),
        }) + "\n");
      }
    );

    return result;
  }

  const envConfig = parseObject(config.env) as Record<string, unknown>;

  // Load API key pool (N keys = N parallel slots)
  const apiKeys = loadApiKeys(envConfig);

  if (apiKeys.length === 0) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage:
        "No ZAI API keys configured. Set ZAI_API_KEYS (comma-separated pool), " +
        "or ZAI_API_KEY_0..N (numbered), or ZAI_API_KEY (single) in adapter env or server environment.",
      errorCode: "zai_auth_required",
    };
  }

  // Build prompt from Paperclip context
  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work.",
  );

  const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
  let instructionsPrefix = "";
  if (instructionsFilePath) {
    try {
      const instructionsContents = await fs.readFile(instructionsFilePath, "utf8");
      instructionsPrefix = `${instructionsContents}\n\n`;
    } catch (err) {
      await onLog(
        "stdout",
        `[paperclip] Warning: could not read instructions file "${instructionsFilePath}": ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  };

  const wakePrompt = renderPaperclipWakePrompt(context.paperclipWake, { resumedSession: false });
  const renderedPrompt = renderTemplate(promptTemplate, templateData);
  const prompt = joinPromptSections([instructionsPrefix, wakePrompt, renderedPrompt]);

  // Build messages array
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
    stream,
  };
  if (thinking) {
    requestBody.thinking = { type: "enabled" };
  }

  if (onMeta) {
    await onMeta({
      adapterType: "zai_local",
      command: `POST ${ZAI_API_BASE_URL}/chat/completions`,
      prompt,
      promptMetrics: { promptChars: prompt.length },
      context,
    });
  }

  const apiUrl = `${ZAI_API_BASE_URL}/chat/completions`;
  const startTs = Date.now();

  const zaiQueue = createZaiQueue(apiKeys.length);
  let activeModel = model;

  await onLog("stdout", JSON.stringify({
    type: "system",
    subtype: "init",
    model: activeModel,
    tier: getModelTier(activeModel),
    provider: "zai",
    poolSize: apiKeys.length,
    queue: zaiQueue.stats(),
    ts: new Date().toISOString(),
  }) + "\n");

  // Acquire a slot from the pool. Each slot maps to an API key.
  let slotAcquired = true;
  let activeKeyIndex = 0;

  try {
    const acquisition = await zaiQueue.acquire(onLog);
    activeKeyIndex = acquisition.keyIndex;
    zaiQueue.registerCleanup();
  } catch (slotErr) {
    if (slotErr instanceof Error && slotErr.message === "zai_slot_timeout") {
      await onLog("stderr",
        `[zai] All ${apiKeys.length} slots busy — proceeding without slot (may 429)\n`,
      );
      // Pick a random key as fallback
      activeKeyIndex = Math.floor(Math.random() * apiKeys.length);
      slotAcquired = false;
    } else {
      throw slotErr;
    }
  }

  const activeApiKey = apiKeys[activeKeyIndex] ?? apiKeys[0];
  const keyHint = `${activeApiKey.slice(0, 6)}...${activeApiKey.slice(-4)}`;

  await onLog("stderr",
    `[zai] Using key #${activeKeyIndex} (${keyHint}) for ${activeModel} [pool: ${apiKeys.length}]\n`,
  );

  try {
    const MAX_RETRIES = 8;
    const BASE_DELAY_MS = 5000;
    let response!: Response;
    let lastErrorBody = "";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // After MAX_RETRIES_BEFORE_FALLBACK consecutive 429s, switch to a cheaper model
      if (attempt === MAX_RETRIES_BEFORE_FALLBACK && attempt > 0) {
        const nextModel = MODEL_FALLBACK_CHAIN[activeModel];
        if (nextModel) {
          await onLog("stderr",
            `[zai] ${attempt} retries exhausted on ${activeModel}, falling back to ${nextModel}\n`,
          );
          activeModel = nextModel;
          requestBody.model = activeModel;
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutSec * 1000);

      response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${activeApiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status !== 429 || attempt === MAX_RETRIES) break;

      lastErrorBody = await response.text();

      let zaiErrorCode = "";
      try {
        const parsed = JSON.parse(lastErrorBody);
        zaiErrorCode = parsed?.error?.code ?? "";
      } catch { /* ignore */ }

      const retryAfterHeader = response.headers.get("Retry-After") ?? response.headers.get("x-retry-after");
      let delayMs: number;
      if (retryAfterHeader) {
        const retryAfterSec = Number(retryAfterHeader);
        delayMs = (Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : BASE_DELAY_MS * Math.pow(2, attempt)) + Math.random() * 1000;
      } else if (zaiErrorCode === "1302" || zaiErrorCode === "1305") {
        delayMs = 2000 + Math.random() * 2000;
      } else {
        delayMs = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1000;
      }
      delayMs = Math.min(delayMs, 120_000);

      const stats = zaiQueue.stats();
      await onLog("stderr",
        `[zai] 429 (code:${zaiErrorCode || "?"}), retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delayMs / 1000)}s ` +
        `[key#${activeKeyIndex} model:${activeModel} slots:${stats.active}/${stats.total}]\n`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }

    if (!response.ok) {
      const errorBody = lastErrorBody || await response.text();
      await onLog("stderr", `[zai] API error ${response.status}: ${errorBody}\n`);
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: `Zai API error ${response.status}: ${errorBody}`,
        errorCode: response.status === 401 ? "zai_auth_required" : "zai_api_error",
        provider: "zai",
        biller: "zai",
        model,
        billingType: "api",
      };
    }

    let fullContent = "";
    let inputTokens = 0;
    let outputTokens = 0;

    if (stream && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data: ")) continue;

          try {
            const chunk = JSON.parse(trimmed.slice(6)) as Record<string, unknown>;
            const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
            const delta = choices?.[0]?.delta as Record<string, string> | undefined;

            const contentPiece = delta?.content || delta?.reasoning_content || "";
            if (contentPiece) {
              fullContent += contentPiece;
              await onLog("stdout", JSON.stringify({
                type: "assistant",
                message: { text: contentPiece },
                ts: new Date().toISOString(),
              }) + "\n");
            }

            const usage = chunk.usage as Record<string, number> | undefined;
            if (usage) {
              inputTokens = usage.prompt_tokens ?? 0;
              outputTokens = usage.completion_tokens ?? 0;
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    } else {
      const data = await response.json() as Record<string, unknown>;
      const choices = data.choices as Array<Record<string, unknown>> | undefined;
      const choice = choices?.[0];
      const msg = choice?.message as Record<string, unknown> | undefined;
      fullContent = (msg?.content as string) ?? (msg?.reasoning_content as string) ?? "";
      const usage = data.usage as Record<string, number> | undefined;
      inputTokens = usage?.prompt_tokens ?? 0;
      outputTokens = usage?.completion_tokens ?? 0;

      if (fullContent) {
        await onLog("stdout", JSON.stringify({
          type: "assistant",
          message: { text: fullContent },
          ts: new Date().toISOString(),
        }) + "\n");
      }
    }

    const costUsd = estimateCost(activeModel, inputTokens, outputTokens);
    const elapsedMs = Date.now() - startTs;

    await onLog("stdout", JSON.stringify({
      type: "result",
      subtype: "end_turn",
      is_error: false,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      cost_usd: costUsd,
      model_used: activeModel,
      key_index: activeKeyIndex,
      fallback: activeModel !== model,
      ts: new Date().toISOString(),
    }) + "\n");

    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      usage: { inputTokens, outputTokens },
      provider: "zai",
      biller: "zai",
      model: activeModel,
      billingType: "api",
      costUsd,
      resultJson: {
        content: fullContent,
        elapsedMs,
        model: activeModel,
        requestedModel: model,
        keyIndex: activeKeyIndex,
      },
      summary: fullContent.slice(0, 500),
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    const message = isTimeout
      ? `Request timed out after ${timeoutSec}s`
      : `Zai API request failed: ${err instanceof Error ? err.message : String(err)}`;

    await onLog("stderr", `[zai] ${message}\n`);

    return {
      exitCode: 1,
      signal: null,
      timedOut: isTimeout,
      errorMessage: message,
      provider: "zai",
      biller: "zai",
      model: activeModel,
      billingType: "api",
    };
  } finally {
    if (slotAcquired) {
      zaiQueue.release();
    }
  }
}

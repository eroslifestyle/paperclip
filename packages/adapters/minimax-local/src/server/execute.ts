import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  asString,
  asNumber,
  parseObject,
  buildPaperclipEnv,
  ensurePathInEnv,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_MODEL = "MiniMax-M2.5";
const DEFAULT_BASE_URL = "https://api.minimax.io/v1";
const DEFAULT_PYTHON = process.platform === "win32" ? "python" : "python3";
const DEFAULT_TIMEOUT_SEC = 600;
const DEFAULT_GRACE_SEC = 10;
const DEFAULT_MAX_TURNS = 25;

function resolveWorkerScript(): string {
  // packages/adapters/minimax-local/dist/server/execute.js → ../../python/worker.py
  // packages/adapters/minimax-local/src/server/execute.ts  → ../../python/worker.py
  return path.resolve(__moduleDir, "..", "..", "python", "worker.py");
}

function buildPrompt(context: Record<string, unknown>): string {
  const issue = parseObject(context.issue);
  const task = parseObject(context.task);
  const instructions = asString(context.instructions, "");

  const sections: string[] = [];
  if (instructions) sections.push(`# Instructions\n${instructions}`);
  if (issue && Object.keys(issue).length > 0) {
    const title = asString(issue.title, "");
    const body = asString(issue.body, "");
    if (title) sections.push(`# Issue: ${title}`);
    if (body) sections.push(body);
  }
  if (task && Object.keys(task).length > 0) {
    const desc = asString(task.description, "");
    if (desc) sections.push(`# Task\n${desc}`);
  }
  if (sections.length === 0) {
    sections.push("Continue working on the assigned task.");
  }
  return sections.join("\n\n");
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const config = ctx.config ?? {};
  const model = asString(config.model, DEFAULT_MODEL);
  const baseUrl = asString(config.baseUrl, DEFAULT_BASE_URL);
  const apiKey =
    asString(config.apiKey, "") ||
    asString(process.env.MINIMAX_API_KEY, "");
  const pythonCommand = asString(config.pythonCommand, DEFAULT_PYTHON);
  const cwd = asString(config.cwd, process.cwd());
  const timeoutSec = asNumber(config.timeoutSec, DEFAULT_TIMEOUT_SEC);
  const graceSec = asNumber(config.graceSec, DEFAULT_GRACE_SEC);
  const maxTurns = asNumber(config.maxTurns, DEFAULT_MAX_TURNS);
  const extraEnv = parseObject(config.env);

  if (!apiKey) {
    return {
      exitCode: null,
      signal: null,
      timedOut: false,
      errorMessage:
        "MiniMax API key missing. Set MINIMAX_API_KEY env var or adapterConfig.apiKey.",
      errorCode: "MINIMAX_API_KEY_MISSING",
      provider: "minimax",
      model,
    };
  }

  const workerScript = resolveWorkerScript();
  const prompt = buildPrompt(ctx.context ?? {});

  const baseEnv: Record<string, string> = {
    ...buildPaperclipEnv(ctx.agent),
    MINIMAX_API_KEY: apiKey,
    MINIMAX_BASE_URL: baseUrl,
    MINIMAX_MODEL: model,
    MINIMAX_MAX_TURNS: String(maxTurns),
    MINIMAX_WORKDIR: cwd,
  };
  for (const [key, value] of Object.entries(extraEnv)) {
    if (typeof value === "string") baseEnv[key] = value;
  }
  ensurePathInEnv(baseEnv as NodeJS.ProcessEnv);
  const env = baseEnv;

  await ctx.onMeta?.({
    adapterType: "minimax_local",
    command: pythonCommand,
    cwd,
    commandArgs: [workerScript, "--workdir", cwd, prompt],
    env: { ...env, MINIMAX_API_KEY: "***redacted***" },
    prompt,
  });

  const proc = await runChildProcess(ctx.runId, pythonCommand, [workerScript, "--workdir", cwd, prompt], {
    cwd,
    env,
    timeoutSec,
    graceSec,
    onLog: ctx.onLog,
    onSpawn: ctx.onSpawn,
  });

  const stdout = proc.stdout || "";
  const summary = stdout.trim().split("\n").slice(-20).join("\n");

  return {
    exitCode: proc.exitCode,
    signal: proc.signal,
    timedOut: proc.timedOut,
    errorMessage: proc.exitCode === 0 ? null : `MiniMax worker exited with code ${proc.exitCode}`,
    provider: "minimax",
    biller: "minimax",
    model,
    billingType: "api",
    summary,
  };
}

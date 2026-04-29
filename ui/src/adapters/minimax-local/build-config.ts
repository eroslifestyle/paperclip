import type { CreateConfigValues } from "../types";

export function buildMinimaxLocalConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {};
  if (v.command) ac.pythonCommand = v.command;
  if (v.cwd) ac.cwd = v.cwd;
  if (v.model) ac.model = v.model;

  const schema = v.adapterSchemaValues ?? {};
  if (typeof schema.baseUrl === "string" && schema.baseUrl.length > 0) {
    ac.baseUrl = schema.baseUrl;
  }
  if (typeof schema.maxTurns === "number" && Number.isFinite(schema.maxTurns)) {
    ac.maxTurns = schema.maxTurns;
  }
  if (typeof schema.timeoutSec === "number" && Number.isFinite(schema.timeoutSec)) {
    ac.timeoutSec = schema.timeoutSec;
  }
  return ac;
}

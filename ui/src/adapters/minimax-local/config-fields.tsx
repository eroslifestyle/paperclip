import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  DraftInput,
  DraftNumberInput,
} from "../../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

const baseUrlHint =
  "MiniMax API base URL. Default: https://api.minimax.io/v1.";
const maxTurnsHint =
  "Maximum tool-calling iterations the worker can perform per run. Default: 25.";
const timeoutHint =
  "Run timeout in seconds. Default: 600.";
const apiKeyHint =
  "The MiniMax API key is read from the MINIMAX_API_KEY environment variable on the Paperclip server. Set it in ~/.paperclip/instances/default/.env or via Paperclip secrets — not here.";

function readSchemaString(
  isCreate: boolean,
  values: AdapterConfigFieldsProps["values"],
  config: Record<string, unknown>,
  key: string,
): string {
  if (isCreate) {
    const sv = (values?.adapterSchemaValues ?? {}) as Record<string, unknown>;
    return typeof sv[key] === "string" ? (sv[key] as string) : "";
  }
  const v = config[key];
  return typeof v === "string" ? v : "";
}

function readSchemaNumber(
  isCreate: boolean,
  values: AdapterConfigFieldsProps["values"],
  config: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  if (isCreate) {
    const sv = (values?.adapterSchemaValues ?? {}) as Record<string, unknown>;
    const n = sv[key];
    return typeof n === "number" && Number.isFinite(n) ? n : fallback;
  }
  const n = config[key];
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function writeSchemaValue(
  isCreate: boolean,
  values: AdapterConfigFieldsProps["values"],
  set: AdapterConfigFieldsProps["set"],
  mark: AdapterConfigFieldsProps["mark"],
  key: string,
  value: unknown,
): void {
  if (isCreate) {
    const prev = (values?.adapterSchemaValues ?? {}) as Record<string, unknown>;
    set!({ adapterSchemaValues: { ...prev, [key]: value } });
  } else {
    mark("adapterConfig", key, value);
  }
}

export function MinimaxLocalConfigFields({
  isCreate,
  values,
  set,
  config,
  mark,
}: AdapterConfigFieldsProps) {
  return (
    <>
      <Field label="API key" hint={apiKeyHint}>
        <div className="text-xs text-muted-foreground rounded-md border border-dashed border-border px-2.5 py-1.5 bg-transparent">
          Set <code className="text-foreground">MINIMAX_API_KEY</code> in your Paperclip server environment.
        </div>
      </Field>

      <Field label="Base URL (optional)" hint={baseUrlHint}>
        <DraftInput
          value={readSchemaString(isCreate, values, config, "baseUrl")}
          onCommit={(v) =>
            writeSchemaValue(isCreate, values, set, mark, "baseUrl", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="https://api.minimax.io/v1"
        />
      </Field>

      <Field label="Max turns per run" hint={maxTurnsHint}>
        <DraftNumberInput
          value={readSchemaNumber(isCreate, values, config, "maxTurns", 25)}
          onCommit={(v) =>
            writeSchemaValue(isCreate, values, set, mark, "maxTurns", v || undefined)
          }
          immediate
          className={inputClass}
        />
      </Field>

      <Field label="Run timeout (seconds)" hint={timeoutHint}>
        <DraftNumberInput
          value={readSchemaNumber(isCreate, values, config, "timeoutSec", 600)}
          onCommit={(v) =>
            writeSchemaValue(isCreate, values, set, mark, "timeoutSec", v || undefined)
          }
          immediate
          className={inputClass}
        />
      </Field>
    </>
  );
}

import type { UIAdapterModule } from "../types";
import { parseMinimaxStdoutLine } from "./parse-stdout";
import { MinimaxLocalConfigFields } from "./config-fields";
import { buildMinimaxLocalConfig } from "./build-config";

export const minimaxLocalUIAdapter: UIAdapterModule = {
  type: "minimax_local",
  label: "MiniMax (local)",
  parseStdoutLine: parseMinimaxStdoutLine,
  ConfigFields: MinimaxLocalConfigFields,
  buildAdapterConfig: buildMinimaxLocalConfig,
};

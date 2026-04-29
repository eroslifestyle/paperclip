import {
  execute as qwenExecute,
  testEnvironment as qwenTestEnvironment,
} from "@paperclipai/adapter-qwen-local/server";
import {
  agentConfigurationDoc as qwenAgentConfigurationDoc,
  models as qwenModels,
} from "@paperclipai/adapter-qwen-local";
import {
  execute as deepseekExecute,
  testEnvironment as deepseekTestEnvironment,
} from "@paperclipai/adapter-deepseek-local/server";
import {
  agentConfigurationDoc as deepseekAgentConfigurationDoc,
  models as deepseekModels,
} from "@paperclipai/adapter-deepseek-local";
import { BUILTIN_ADAPTER_TYPES } from "./builtin-adapter-types.js";
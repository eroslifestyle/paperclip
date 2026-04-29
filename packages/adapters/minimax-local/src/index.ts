export const type = "minimax_local";
export const label = "MiniMax (local worker)";

export const models = [
  { id: "MiniMax-M2.5", label: "MiniMax M2.5 (default coding, 60 tps)" },
  { id: "MiniMax-M2.5-highspeed", label: "MiniMax M2.5 high-speed (~100 tps)" },
  { id: "MiniMax-M2.7", label: "MiniMax M2.7 (complex tasks)" },
  { id: "MiniMax-M2.7-highspeed", label: "MiniMax M2.7 high-speed" },
];

export const agentConfigurationDoc = `# minimax_local agent configuration

Adapter: minimax_local

Spawns a local Python worker (\`python python/worker.py\`) that connects to the MiniMax
API (https://api.minimax.io/v1) and runs an autonomous tool-calling loop with read_file,
write_file, edit_file, bash, list_files, grep tools scoped to the agent workspace.

Core fields:
- model (string, optional): MiniMax model id. Default: "MiniMax-M2.5"
- apiKey (string, optional): MiniMax API key. Falls back to MINIMAX_API_KEY env var
- baseUrl (string, optional): API base URL. Default: "https://api.minimax.io/v1"
- maxTurns (number, optional): max tool-call iterations per run. Default: 25
- pythonCommand (string, optional): python executable. Default: "python" (or "python3")
- cwd (string, optional): working directory the worker operates in. Defaults to workspace.
- timeoutSec (number, optional): run timeout in seconds. Default: 600
- env (object, optional): KEY=VALUE environment variables passed to the worker

Operational notes:
- The MiniMax API key is sensitive. Prefer setting it via Paperclip secrets or the
  MINIMAX_API_KEY environment variable on the server, not in adapterConfig.
- The worker runs with full filesystem access to the configured cwd. Never point
  it at directories you don't want it to modify.
- This adapter is API-billed (no subscription). Tokens consumed are reported per run.
`;

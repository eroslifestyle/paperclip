import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readPaperclipRuntimeSkillEntries,
  resolvePaperclipDesiredSkillNames,
} from "@paperclipai/adapter-utils/server-utils";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));

export async function listSkills(config: Record<string, unknown>): Promise<Array<{ key: string; description: string }>> {
  const entries = await readPaperclipRuntimeSkillEntries(config, __moduleDir);
  return entries.map((entry) => ({
    key: entry.key,
    description: entry.runtimeName ?? entry.key,
  }));
}

export async function syncSkills(
  config: Record<string, unknown>,
  _desiredSkills?: string[],
): Promise<{ synced: string[]; removed: string[] }> {
  // ZAI is a pure HTTP adapter — skills are injected into the prompt, not symlinked to a CLI.
  // This function reports available skills for the UI but does not write to disk.
  const entries = await readPaperclipRuntimeSkillEntries(config, __moduleDir);
  const desiredNames = new Set(
    resolvePaperclipDesiredSkillNames(config, entries),
  );
  return {
    synced: entries.filter((e) => desiredNames.has(e.key)).map((e) => e.key),
    removed: [],
  };
}

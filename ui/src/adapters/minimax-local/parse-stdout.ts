import type { TranscriptEntry } from "../types";

const TURN_RE = /^=== Turn (\d+)\/(\d+) ===$/;
const TOOL_RE = /^Tool: (\w+)\((.*)\)$/;
const RESULT_RE = /^Result: (.*)$/;
const ASSISTANT_RE = /^Assistant: (.*)$/;

export function parseMinimaxStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  if (TURN_RE.test(trimmed)) {
    return [{ kind: "stdout", ts, text: trimmed }];
  }
  if (TOOL_RE.test(trimmed) || RESULT_RE.test(trimmed) || ASSISTANT_RE.test(trimmed)) {
    return [{ kind: "stdout", ts, text: trimmed }];
  }
  return [{ kind: "stdout", ts, text: line }];
}

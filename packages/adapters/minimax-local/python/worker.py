#!/usr/bin/env python3
"""
MiniMax Worker for Paperclip — autonomous coding agent.

Spawned by the minimax_local Paperclip adapter. Connects to the MiniMax API
(OpenAI-compatible) and runs an autonomous tool-calling loop with
read_file, write_file, edit_file, bash, list_files, grep tools scoped
to the configured workdir.

Configuration via environment variables:
- MINIMAX_API_KEY (required)
- MINIMAX_BASE_URL (default: https://api.minimax.io/v1)
- MINIMAX_MODEL (default: MiniMax-M2.5)
- MINIMAX_MAX_TURNS (default: 25)
- MINIMAX_WORKDIR (default: cwd)

Usage:
    python worker.py "Task description"
    python worker.py --workdir ./project "Add tests"
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = "https://api.minimax.io/v1"
DEFAULT_MODEL = "MiniMax-M2.5"
DEFAULT_MAX_TURNS = 25
BASH_TIMEOUT_SEC = 120
MAX_TOOL_OUTPUT_BYTES = 8192


TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read file contents (relative to workdir).",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Create or overwrite a file with the given content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_file",
            "description": "Replace the first occurrence of `search` with `replace` in `path`.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "search": {"type": "string"},
                    "replace": {"type": "string"},
                },
                "required": ["path", "search", "replace"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": "Run a shell command in the workdir.",
            "parameters": {
                "type": "object",
                "properties": {"command": {"type": "string"}},
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List files in a directory (optional glob pattern).",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "pattern": {"type": "string"},
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "grep",
            "description": "Search a regex pattern in files (recursive, returns matching lines).",
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string"},
                    "path": {"type": "string"},
                },
                "required": ["pattern"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "task_complete",
            "description": "Mark the assigned task as complete and provide a summary.",
            "parameters": {
                "type": "object",
                "properties": {"summary": {"type": "string"}},
                "required": ["summary"],
            },
        },
    },
]


SYSTEM_PROMPT = """You are an autonomous coding agent working in a sandboxed workspace.

Rules:
1. Read existing files before modifying them (read_file, list_files, grep).
2. Write complete, working code — never placeholders or TODO stubs.
3. Use edit_file for surgical changes; write_file only for new files or full rewrites.
4. Verify your work with bash (run tests, type checks, linters where available).
5. When the task is done, call task_complete with a concise summary.

No need to ask for confirmation. Execute directly."""


def truncate(text: str, limit: int = MAX_TOOL_OUTPUT_BYTES) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n... [truncated, {len(text) - limit} more bytes]"


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


class MiniMaxWorker:
    def __init__(self, workdir: Path, api_key: str, base_url: str, model: str) -> None:
        self.workdir = workdir.resolve()
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.messages: list[dict[str, Any]] = []
        self.total_input_tokens = 0
        self.total_output_tokens = 0

    def safe_path(self, rel: str) -> Path:
        target = (self.workdir / rel).resolve()
        try:
            target.relative_to(self.workdir)
        except ValueError as exc:
            raise PermissionError(f"Path escapes workdir: {rel}") from exc
        return target

    def execute_tool(self, name: str, args: dict[str, Any]) -> str:
        try:
            if name == "read_file":
                p = self.safe_path(args["path"])
                if not p.exists():
                    return f"Error: file not found: {args['path']}"
                return truncate(p.read_text(encoding="utf-8", errors="replace"))

            if name == "write_file":
                p = self.safe_path(args["path"])
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(args["content"], encoding="utf-8")
                return f"Wrote {len(args['content'])} chars to {args['path']}"

            if name == "edit_file":
                p = self.safe_path(args["path"])
                if not p.exists():
                    return f"Error: file not found: {args['path']}"
                content = p.read_text(encoding="utf-8")
                if args["search"] not in content:
                    return f"Error: search string not found in {args['path']}"
                new_content = content.replace(args["search"], args["replace"], 1)
                p.write_text(new_content, encoding="utf-8")
                return f"Edited {args['path']}"

            if name == "bash":
                proc = subprocess.run(
                    args["command"],
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=BASH_TIMEOUT_SEC,
                    cwd=self.workdir,
                )
                output = (proc.stdout or "") + (proc.stderr or "")
                status = "OK" if proc.returncode == 0 else f"FAIL (exit {proc.returncode})"
                return f"[{status}]\n{truncate(output)}"

            if name == "list_files":
                p = self.safe_path(args["path"])
                if not p.exists():
                    return f"Error: directory not found: {args['path']}"
                pattern = args.get("pattern", "*")
                files = sorted(p.glob(pattern))[:200]
                return "\n".join(str(f.relative_to(self.workdir)) for f in files) or "(no matches)"

            if name == "grep":
                pattern = args["pattern"]
                search_path = self.safe_path(args.get("path", ".")) if args.get("path") else self.workdir
                proc = subprocess.run(
                    ["grep", "-rn", "--exclude-dir=node_modules", "--exclude-dir=.git", pattern, str(search_path)],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    cwd=self.workdir,
                )
                return truncate(proc.stdout or "(no matches)")

            if name == "task_complete":
                return f"TASK_COMPLETE: {args['summary']}"

            return f"Error: unknown tool: {name}"

        except Exception as exc:
            return f"Error executing {name}: {exc}"

    def chat_completion(self) -> dict[str, Any]:
        url = f"{self.base_url}/chat/completions"
        body = json.dumps(
            {
                "model": self.model,
                "messages": self.messages,
                "tools": TOOLS,
                "tool_choice": "auto",
                "max_tokens": 4096,
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"MiniMax API HTTP {e.code}: {err_body[:500]}") from e

    def run(self, task: str, max_turns: int) -> str:
        self.messages = [
            {"role": "system", "content": SYSTEM_PROMPT + f"\n\nWorkdir: {self.workdir}"},
            {"role": "user", "content": task},
        ]

        for turn in range(max_turns):
            log(f"=== Turn {turn + 1}/{max_turns} ===")
            data = self.chat_completion()

            usage = data.get("usage", {})
            self.total_input_tokens += int(usage.get("prompt_tokens", 0))
            self.total_output_tokens += int(usage.get("completion_tokens", 0))

            choice = data["choices"][0]
            msg = choice["message"]
            self.messages.append(msg)

            if msg.get("content"):
                log(f"Assistant: {msg['content'][:300]}")

            tool_calls = msg.get("tool_calls") or []
            if not tool_calls:
                return msg.get("content") or "Run finished without explicit summary."

            for tool_call in tool_calls:
                fn = tool_call["function"]
                name = fn["name"]
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except json.JSONDecodeError:
                    args = {}
                log(f"Tool: {name}({json.dumps(args, ensure_ascii=False)[:200]})")
                result = self.execute_tool(name, args)
                log(f"Result: {result[:200]}")

                if result.startswith("TASK_COMPLETE:"):
                    return result.replace("TASK_COMPLETE: ", "", 1)

                self.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "content": result,
                    }
                )

        return "Max turns reached without explicit completion."


def main() -> int:
    parser = argparse.ArgumentParser(description="MiniMax Worker for Paperclip")
    parser.add_argument("task", nargs="?", help="Task description (read from stdin if omitted)")
    parser.add_argument("--workdir", "-w", default=os.environ.get("MINIMAX_WORKDIR", "."))
    parser.add_argument("--model", "-m", default=os.environ.get("MINIMAX_MODEL", DEFAULT_MODEL))
    parser.add_argument(
        "--max-turns",
        "-t",
        type=int,
        default=int(os.environ.get("MINIMAX_MAX_TURNS", DEFAULT_MAX_TURNS)),
    )

    args = parser.parse_args()

    api_key = os.environ.get("MINIMAX_API_KEY", "").strip()
    if not api_key:
        print("Error: MINIMAX_API_KEY environment variable is not set", file=sys.stderr)
        return 2

    base_url = os.environ.get("MINIMAX_BASE_URL", DEFAULT_BASE_URL).strip() or DEFAULT_BASE_URL

    task = args.task if args.task else sys.stdin.read()
    if not task.strip():
        print("Error: empty task", file=sys.stderr)
        return 2

    workdir = Path(args.workdir).resolve()
    workdir.mkdir(parents=True, exist_ok=True)

    worker = MiniMaxWorker(workdir, api_key, base_url, args.model)
    try:
        result = worker.run(task, args.max_turns)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    log(
        f"Tokens used: input={worker.total_input_tokens} output={worker.total_output_tokens}"
    )
    print(f"\n[DONE]\n{result}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

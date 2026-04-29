import type { AdapterEnvironmentTestResult, AdapterEnvironmentCheck } from "@paperclipai/adapter-utils";

const DEFAULT_BASE_URL = "https://api.minimax.io/v1";
const DEFAULT_MODEL = "MiniMax-M2.5";

export async function testEnvironment(input: {
  config?: Record<string, unknown>;
}): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = input.config ?? {};
  const apiKey =
    (typeof config.apiKey === "string" && config.apiKey.trim()) ||
    (typeof process.env.MINIMAX_API_KEY === "string" && process.env.MINIMAX_API_KEY.trim()) ||
    "";
  const baseUrl =
    typeof config.baseUrl === "string" && config.baseUrl.trim() ? config.baseUrl.trim() : DEFAULT_BASE_URL;
  const model = typeof config.model === "string" && config.model.trim() ? config.model.trim() : DEFAULT_MODEL;

  if (!apiKey) {
    checks.push({
      code: "minimax.api_key.missing",
      level: "error",
      message: "MINIMAX_API_KEY is not set",
      hint: "Set MINIMAX_API_KEY in the server environment or adapterConfig.apiKey.",
    });
    return { adapterType: "minimax_local", status: "fail", checks, testedAt: new Date().toISOString() };
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      checks.push({
        code: "minimax.api.unreachable",
        level: "error",
        message: `MiniMax API returned HTTP ${res.status}`,
        detail: body.slice(0, 500),
      });
      return { adapterType: "minimax_local", status: "fail", checks, testedAt: new Date().toISOString() };
    }
    const data = (await res.json()) as { base_resp?: { status_code?: number; status_msg?: string } };
    if (data?.base_resp && data.base_resp.status_code !== 0) {
      checks.push({
        code: "minimax.api.error",
        level: "error",
        message: `MiniMax API error: ${data.base_resp.status_msg ?? "unknown"}`,
      });
      return { adapterType: "minimax_local", status: "fail", checks, testedAt: new Date().toISOString() };
    }
    checks.push({
      code: "minimax.api.reachable",
      level: "info",
      message: `MiniMax API reachable (${baseUrl}, model=${model})`,
    });
    return { adapterType: "minimax_local", status: "pass", checks, testedAt: new Date().toISOString() };
  } catch (err) {
    checks.push({
      code: "minimax.api.network_error",
      level: "error",
      message: `Network error contacting MiniMax: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { adapterType: "minimax_local", status: "fail", checks, testedAt: new Date().toISOString() };
  }
}

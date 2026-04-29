import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { forbidden } from "../errors.js";

const API_KEY_PATH = path.join(os.homedir(), ".zai", "api_key");
const CONFIG_PATH = path.join(os.homedir(), ".zai", "config.json");
const ZAI_API_BASE_URL = "https://api.z.ai/api/coding/paas/v4";

export function zaiSettingsRoutes() {
  const router = Router();

  // ── GET /instance/settings/zai/status ─────────────────────
  router.get("/instance/settings/zai/status", async (req, res) => {
    if (req.actor.type !== "board") throw forbidden("Board access required");

    const savedKey = await readApiKey();
    const envKey = (process.env.ZAI_API_KEY ?? "").trim();

    let defaultModel = "glm-4.7"; // Default value
    try {
      const configData = await fs.readFile(CONFIG_PATH, "utf8");
      const config = JSON.parse(configData);
      if (config.defaultModel) {
        defaultModel = config.defaultModel;
      }
    } catch {
      // Use default if config doesn't exist
    }

    res.json({
      connected: Boolean(savedKey || envKey),
      hasApiKey: Boolean(savedKey),
      hasEnvKey: Boolean(envKey),
      keyPreview: savedKey ? `${savedKey.slice(0, 8)}...${savedKey.slice(-4)}` : undefined,
      envKeyPreview: envKey ? `${envKey.slice(0, 8)}...${envKey.slice(-4)}` : undefined,
      keyPath: API_KEY_PATH,
      defaultModel,
    });
  });

  // ── POST /instance/settings/zai/api-key ──────────────────
  router.post("/instance/settings/zai/api-key", async (req, res) => {
    if (req.actor.type !== "board") throw forbidden("Board access required");

    const { apiKey } = req.body as { apiKey: string };
    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
      return res.status(400).json({ error: "API key non valida." });
    }

    const dir = path.dirname(API_KEY_PATH);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(API_KEY_PATH, apiKey.trim(), { mode: 0o600 });

    // Also set it as env var for the current process so adapters pick it up immediately
    process.env.ZAI_API_KEY = apiKey.trim();

    // Test the key
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const testRes = await fetch(`${ZAI_API_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: "glm-4.5-flash",
          messages: [{ role: "user", content: "Respond with hello." }],
          max_tokens: 32,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (testRes.ok) {
        return res.json({ success: true, message: "API key salvata e verificata. Connessione a Zai GLM OK." });
      }

      const errBody = await testRes.text();
      res.json({
        success: false,
        error: `Key salvata ma test fallito (${testRes.status}): ${errBody.slice(0, 100)}`,
      });
    } catch (err) {
      res.json({
        success: false,
        error: `Key salvata ma errore: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  // ── GET /instance/settings/zai/api-key-status ────────────
  router.get("/instance/settings/zai/api-key-status", async (req, res) => {
    if (req.actor.type !== "board") throw forbidden("Board access required");

    const savedKey = await readApiKey();
    const envKey = (process.env.ZAI_API_KEY ?? "").trim();

    return res.json({
      hasKey: Boolean(savedKey),
      keyPreview: savedKey ? `${savedKey.slice(0, 8)}...${savedKey.slice(-4)}` : undefined,
      hasEnvKey: Boolean(envKey),
      envKeyPreview: envKey ? `${envKey.slice(0, 8)}...${envKey.slice(-4)}` : undefined,
    });
  });

  // ── DELETE /instance/settings/zai/api-key ─────────────────
  router.delete("/instance/settings/zai/api-key", async (req, res) => {
    if (req.actor.type !== "board") throw forbidden("Board access required");

    try { await fs.unlink(API_KEY_PATH); } catch { /* ok */ }
    delete process.env.ZAI_API_KEY;
    res.json({ removed: true });
  });

  // ── POST /instance/settings/zai/default-model ───────────────
  router.post("/instance/settings/zai/default-model", async (req, res) => {
    if (req.actor.type !== "board") throw forbidden("Board access required");

    const { model } = req.body as { model: string };
    if (!model || typeof model !== "string") {
      return res.status(400).json({ error: "Modello non valido." });
    }

    const validModels = ["glm-5.1", "glm-4.7", "glm-4.7-flash", "glm-4.5-flash"];
    if (!validModels.includes(model)) {
      return res.status(400).json({ error: "Modello non supportato." });
    }

    const configPath = path.join(os.homedir(), ".zai", "config.json");
    let config: { defaultModel?: string } = {};

    try {
      const configData = await fs.readFile(configPath, "utf8");
      config = JSON.parse(configData);
    } catch {
      // File doesn't exist or is invalid, start with empty config
    }

    config.defaultModel = model;

    const dir = path.dirname(configPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });

    res.json({ success: true, message: `Modello predefinito impostato su ${model}` });
  });

  // ── POST /instance/settings/zai/test ──────────────────────
  router.post("/instance/settings/zai/test", async (req, res) => {
    if (req.actor.type !== "board") throw forbidden("Board access required");

    const savedKey = await readApiKey();
    const envKey = (process.env.ZAI_API_KEY ?? "").trim();
    const apiKey = savedKey ?? envKey;

    if (!apiKey) {
      return res.json({ success: false, error: "Nessuna API key configurata." });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const testRes = await fetch(`${ZAI_API_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "glm-4.5-flash",
          messages: [{ role: "user", content: "Respond with hello." }],
          max_tokens: 32,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (testRes.ok) {
        const data = await testRes.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = data.choices?.[0]?.message?.content?.trim() ?? "";
        return res.json({
          success: true,
          message: `Connessione OK. Risposta: "${content.slice(0, 100)}"`,
        });
      }

      const errBody = await testRes.text();
      res.json({ success: false, error: `API ha risposto ${testRes.status}: ${errBody.slice(0, 200)}` });
    } catch (err) {
      res.json({ success: false, error: `Errore: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  return router;
}

async function readApiKey(): Promise<string | null> {
  try {
    const key = await fs.readFile(API_KEY_PATH, "utf8");
    return key.trim() || null;
  } catch {
    return null;
  }
}

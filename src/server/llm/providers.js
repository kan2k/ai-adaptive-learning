import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { wrapLanguageModel } from "ai";
import fs from "fs";
import os from "os";
import path from "path";
import { log } from "../log.js";

// Shared, live-editable config (gear icon, Electron first run, npx prompt
// all write here). File values win over env so in-app edits apply without
// a restart.
export const LLM_CONFIG_PATH = path.join(os.homedir(), ".config", "ai-adaptive-learning.json");

export function readLLMFile() {
  try {
    return JSON.parse(fs.readFileSync(LLM_CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function writeLLMFile(cfg) {
  fs.mkdirSync(path.dirname(LLM_CONFIG_PATH), { recursive: true, mode: 0o700 });
  fs.writeFileSync(LLM_CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(LLM_CONFIG_PATH, 0o600);
  } catch {
    /* Windows ACLs */
  }
}

// Provider strategy (the LibreChat/Open WebUI pattern): a few native
// presets plus "any OpenAI-compatible base URL", which covers nearly every
// hosted and local runtime. Two tiers everywhere: "fast" for bulk content
// generation, "smart" for the live tutor dialogue.
export const PROVIDERS = {
  openrouter: {
    label: "OpenRouter (300+ models, one key)",
    keyUrl: "https://openrouter.ai/keys",
    defaults: { fast: "google/gemini-2.5-flash", smart: "deepseek/deepseek-v4.1-flash" },
  },
  openai: {
    label: "OpenAI",
    kind: "openai-compat",
    baseURL: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
    defaults: { fast: "gpt-5-mini", smart: "gpt-5-mini" },
  },
  anthropic: {
    label: "Anthropic",
    kind: "anthropic",
    keyUrl: "https://console.anthropic.com/settings/keys",
    defaults: { fast: "claude-haiku-4-5", smart: "claude-sonnet-5" },
  },
  google: {
    label: "Google AI Studio",
    kind: "google",
    keyUrl: "https://aistudio.google.com/apikey",
    defaults: { fast: "gemini-2.5-flash", smart: "gemini-2.5-flash" },
  },
  groq: {
    label: "Groq",
    kind: "openai-compat",
    baseURL: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
    defaults: { fast: "llama-3.3-70b-versatile", smart: "llama-3.3-70b-versatile" },
  },
  deepseek: {
    label: "DeepSeek",
    kind: "openai-compat",
    baseURL: "https://api.deepseek.com/v1",
    keyUrl: "https://platform.deepseek.com/api_keys",
    defaults: { fast: "deepseek-chat", smart: "deepseek-chat" },
  },
  mistral: {
    label: "Mistral",
    kind: "openai-compat",
    baseURL: "https://api.mistral.ai/v1",
    keyUrl: "https://console.mistral.ai/api-keys",
    defaults: { fast: "mistral-small-latest", smart: "mistral-large-latest" },
  },
  together: {
    label: "Together AI",
    kind: "openai-compat",
    baseURL: "https://api.together.xyz/v1",
    keyUrl: "https://api.together.ai/settings/api-keys",
    defaults: {
      fast: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      smart: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    },
  },
  ollama: {
    label: "Ollama (local, free)",
    kind: "openai-compat",
    baseURL: "http://localhost:11434/v1",
    keyless: true,
    defaults: { fast: "llama3.1", smart: "llama3.1" },
  },
  custom: {
    label: "Custom OpenAI-compatible endpoint",
    kind: "openai-compat",
    defaults: { fast: "", smart: "" },
  },
};

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "No LLM configured. Add an API key in setup (desktop: relaunch the app; npx: run again) or set LLM_API_KEY in .env.local and restart.",
    );
    this.name = "MissingApiKeyError";
    this.status = 503;
  }
}

export function getLLMConfig() {
  const file = readLLMFile();
  // Back-compat: the original env contract was OpenRouter/Ollama only.
  let provider = file.provider || process.env.LLM_PROVIDER;
  if (!provider) {
    if (process.env.OLLAMA_BASE_URL) provider = "ollama";
    else provider = "openrouter";
  }
  const preset = PROVIDERS[provider] || PROVIDERS.custom;
  const apiKey =
    file.apiKey ||
    file.openrouterApiKey ||
    process.env.LLM_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    (preset.keyless ? "ollama" : undefined);
  const baseURL =
    file.baseUrl ||
    process.env.LLM_BASE_URL ||
    (provider === "ollama" && process.env.OLLAMA_BASE_URL
      ? `${process.env.OLLAMA_BASE_URL.replace(/\/$/, "")}/v1`
      : preset.baseURL);
  const models = {
    fast:
      file.modelFast ||
      process.env.LLM_MODEL_FAST ||
      process.env.OPENROUTER_MODEL_FAST ||
      (provider === "ollama" && process.env.OLLAMA_MODEL) ||
      preset.defaults.fast,
    smart:
      file.modelSmart ||
      process.env.LLM_MODEL_SMART ||
      process.env.OPENROUTER_MODEL_SMART ||
      (provider === "ollama" && process.env.OLLAMA_MODEL) ||
      preset.defaults.smart,
  };
  return { provider, preset, apiKey, baseURL, models };
}

export function hasLLM() {
  const { apiKey } = getLLMConfig();
  return Boolean(apiKey);
}

export function modelIdForTier(tier = "fast") {
  const { provider, models } = getLLMConfig();
  return `${provider}:${models[tier] || models.fast}`;
}

function usageMiddleware(tier, modelId) {
  return {
    wrapGenerate: async ({ doGenerate }) => {
      const started = Date.now();
      const result = await doGenerate();
      log("info", "llm_usage", {
        tier,
        model: modelId,
        promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens,
        ms: Date.now() - started,
      });
      return result;
    },
    wrapStream: async ({ doStream }) => doStream(),
  };
}

export function getModel({ tier = "fast", temperature } = {}) {
  const { provider, preset, apiKey, baseURL, models } = getLLMConfig();
  if (!apiKey) throw new MissingApiKeyError();
  const modelId = models[tier] || models.fast;

  let model;
  if (provider === "openrouter") {
    const openrouter = createOpenRouter({ apiKey });
    const options =
      temperature !== undefined ? { extraBody: { temperature } } : undefined;
    model = openrouter.chat(modelId, options);
  } else if (preset.kind === "anthropic") {
    model = createAnthropic({ apiKey })(modelId);
  } else if (preset.kind === "google") {
    model = createGoogleGenerativeAI({ apiKey })(modelId);
  } else {
    if (!baseURL) throw new MissingApiKeyError();
    model = createOpenAI({ apiKey, baseURL }).chat(modelId);
  }
  return wrapLanguageModel({
    model,
    middleware: usageMiddleware(tier, `${provider}:${modelId}`),
  });
}

export function errorResponse(error) {
  const status = error?.status === 503 ? 503 : 500;
  return Response.json(
    { error: error?.message || "Internal error" },
    { status },
  );
}

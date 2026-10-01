import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { wrapLanguageModel } from "ai";
import { log } from "../log.js";

// Every call logs its token usage so /api/debug and the cost table in the
// README can be grounded in measured numbers instead of estimates.
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

// Two tiers through OpenRouter: "fast" for bulk content generation
// (concepts, flashcards, graph, titles, explanations), "smart" for the live
// tutor dialogue and chat replies. Ollama runs one model for both tiers.
// Defaults are chosen for students' wallets: the tutor repacks course
// materials every turn, so a frontier smart model costs ~60x more per
// session for a quality gap most study flows don't feel. Set
// OPENROUTER_MODEL_SMART=anthropic/claude-sonnet-5 if you want it anyway.
const FAST_DEFAULT = "google/gemini-2.5-flash";
const SMART_DEFAULT = "deepseek/deepseek-v4.1-flash";

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "No LLM configured. Set OPENROUTER_API_KEY (or OLLAMA_BASE_URL for local models) in .env.local and restart.",
    );
    this.name = "MissingApiKeyError";
    this.status = 503;
  }
}

export function hasLLM() {
  return Boolean(process.env.OLLAMA_BASE_URL || process.env.OPENROUTER_API_KEY);
}

export function modelIdForTier(tier = "fast") {
  if (process.env.OLLAMA_BASE_URL) {
    return `ollama:${process.env.OLLAMA_MODEL || "llama3.1"}`;
  }
  return tier === "smart"
    ? process.env.OPENROUTER_MODEL_SMART || SMART_DEFAULT
    : process.env.OPENROUTER_MODEL_FAST || FAST_DEFAULT;
}

// Returns a chat model. temperature is passed at call sites via extraBody for
// OpenRouter parity with the original Convex code; for Ollama it is ignored
// there and applied by the ai-sdk call options instead.
export function getModel({ tier = "fast", temperature } = {}) {
  if (process.env.OLLAMA_BASE_URL) {
    const ollama = createOpenAI({
      baseURL: `${process.env.OLLAMA_BASE_URL.replace(/\/$/, "")}/v1`,
      apiKey: "ollama",
    });
    return ollama.chat(process.env.OLLAMA_MODEL || "llama3.1");
  }
  if (!process.env.OPENROUTER_API_KEY) {
    throw new MissingApiKeyError();
  }
  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });
  const options =
    temperature !== undefined ? { extraBody: { temperature } } : undefined;
  const modelId =
    tier === "smart"
      ? process.env.OPENROUTER_MODEL_SMART || SMART_DEFAULT
      : process.env.OPENROUTER_MODEL_FAST || FAST_DEFAULT;
  return wrapLanguageModel({
    model: openrouter.chat(modelId, options),
    middleware: usageMiddleware(tier, modelId),
  });
}

export function errorResponse(error) {
  const status = error?.status === 503 ? 503 : 500;
  return Response.json(
    { error: error?.message || "Internal error" },
    { status },
  );
}

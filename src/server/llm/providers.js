import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOpenAI } from "@ai-sdk/openai";

const DEFAULT_MODEL = "google/gemini-2.5-flash";

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

// Returns a chat model. temperature is passed at call sites via extraBody for
// OpenRouter parity with the original Convex code; for Ollama it is ignored
// there and applied by the ai-sdk call options instead.
export function getModel({ temperature } = {}) {
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
  return openrouter.chat(process.env.OPENROUTER_MODEL || DEFAULT_MODEL, options);
}

export function errorResponse(error) {
  const status = error?.status === 503 ? 503 : 500;
  return Response.json(
    { error: error?.message || "Internal error" },
    { status },
  );
}

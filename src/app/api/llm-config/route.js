import { handle, httpError } from "@/server/http";
import {
  PROVIDERS,
  getLLMConfig,
  readLLMFile,
  writeLLMFile,
} from "@/server/llm/providers";

export async function GET() {
  return handle(() => {
    const { provider, preset, apiKey, baseURL, models } = getLLMConfig();
    const file = readLLMFile();
    return {
      provider,
      baseUrl: file.baseUrl || (provider === "custom" ? baseURL : undefined) || "",
      models,
      modelOverrides: { fast: file.modelFast || "", smart: file.modelSmart || "" },
      hasKey: Boolean(apiKey) && !preset.keyless,
      // Enough to recognize the key, never enough to use it.
      keyHint: apiKey && !preset.keyless ? `••••${apiKey.slice(-4)}` : null,
      providers: Object.fromEntries(
        Object.entries(PROVIDERS).map(([id, p]) => [
          id,
          { label: p.label, keyUrl: p.keyUrl || null, keyless: Boolean(p.keyless), defaults: p.defaults },
        ]),
      ),
    };
  });
}

export async function PUT(request) {
  return handle(async () => {
    const body = await request.json();
    if (body.provider && !PROVIDERS[body.provider]) {
      throw httpError("Unknown provider");
    }
    const file = readLLMFile();
    const next = { ...file };
    if (body.provider) next.provider = body.provider;
    // Empty string means "keep what's saved"; null clears.
    if (body.apiKey) next.apiKey = String(body.apiKey).trim();
    if (body.apiKey === null) delete next.apiKey;
    if (body.baseUrl !== undefined) {
      if (body.baseUrl) next.baseUrl = String(body.baseUrl).trim();
      else delete next.baseUrl;
    }
    if (body.modelFast !== undefined) {
      if (body.modelFast) next.modelFast = String(body.modelFast).trim();
      else delete next.modelFast;
    }
    if (body.modelSmart !== undefined) {
      if (body.modelSmart) next.modelSmart = String(body.modelSmart).trim();
      else delete next.modelSmart;
    }
    writeLLMFile(next);
    return { success: true };
  });
}

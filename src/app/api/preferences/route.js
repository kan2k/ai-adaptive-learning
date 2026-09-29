import { handle, httpError } from "@/server/http";
import { getPreferences, savePreferences } from "@/server/db";

export async function GET() {
  return handle(() => ({ preferences: getPreferences() }));
}

export async function PUT(request) {
  return handle(async () => {
    const body = await request.json();
    const preferences = body.preferences;
    if (
      !preferences ||
      typeof preferences.languageComplexity !== "string" ||
      typeof preferences.analogyUsage !== "string" ||
      typeof preferences.wordLength !== "string"
    ) {
      throw httpError("Invalid preferences");
    }
    savePreferences(preferences);
    return { success: true };
  });
}

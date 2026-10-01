import { handle } from "@/server/http";
import { recentEntries } from "@/server/log";
import { getDb, STUDY_DIR } from "@/server/db";
import { hasLLM } from "@/server/llm/providers";

// One stop when something misbehaves: GET /api/debug
// Full history survives restarts at <STUDY_DIR>/.study/logs/app.log
export async function GET(request) {
  const level = new URL(request.url).searchParams.get("level") || undefined;
  return handle(async () => {
    const db = getDb();
    const count = (sql) => db.prepare(sql).get().n;
    return {
      studyDir: STUDY_DIR,
      llmConfigured: hasLLM(),
      model: process.env.OLLAMA_BASE_URL
        ? `ollama:${process.env.OLLAMA_MODEL || "llama3.1"}`
        : process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
      counts: {
        courses: count("SELECT COUNT(*) n FROM courses"),
        files: count("SELECT COUNT(*) n FROM files"),
        filesAwaitingConcepts: count(
          "SELECT COUNT(*) n FROM files WHERE metadata IS NULL",
        ),
        chatThreads: count("SELECT COUNT(*) n FROM chat_threads"),
      },
      recentLog: recentEntries(level).slice(-50),
    };
  }, { route: "debug" });
}

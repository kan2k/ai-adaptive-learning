import { handle, httpError } from "@/server/http";
import { getCourse } from "@/server/db";
import { explainWrongAnswer } from "@/server/llm/explainAnswer";

export const maxDuration = 60;

export async function POST(request, { params }) {
  const { id } = await params;
  return handle(async () => {
    if (!getCourse(id)) throw httpError("Course not found", 404);
    const body = await request.json().catch(() => ({}));
    const { question, answers, chosen, correct, concept } = body || {};
    if (
      typeof question !== "string" ||
      !Array.isArray(answers) ||
      typeof chosen !== "string" ||
      typeof correct !== "string"
    ) {
      throw httpError("question, answers, chosen and correct are required", 400);
    }
    return explainWrongAnswer({ question, answers, chosen, correct, concept });
  }, { route: "explain" });
}

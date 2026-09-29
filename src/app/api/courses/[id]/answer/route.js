import { handle, httpError } from "@/server/http";
import { answerQuestion } from "@/server/llm/tutorAgent";

export const maxDuration = 300;

export async function POST(request, { params }) {
  const { id } = await params;
  return handle(async () => {
    const body = await request.json();
    if (typeof body.answer !== "string") {
      throw httpError("answer is required", 400);
    }
    return answerQuestion(id, body.answer);
  });
}

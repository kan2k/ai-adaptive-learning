import { handle } from "@/server/http";
import { startCourse } from "@/server/llm/tutorAgent";

export const maxDuration = 300;

export async function POST(request, { params }) {
  const { id } = await params;
  return handle(async () => {
    const threadId = await startCourse(id);
    return { success: true, threadId };
  });
}

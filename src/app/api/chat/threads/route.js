import { randomUUID } from "crypto";
import { handle, httpError } from "@/server/http";
import {
  listThreads,
  createThread,
  addMessage,
  getCourseWithFiles,
} from "@/server/db";

export async function GET() {
  return handle(() => listThreads());
}

export async function POST(request) {
  return handle(async () => {
    const body = await request.json();
    const { courseId, title } = body;
    if (!courseId) throw httpError("courseId is required");

    const courseWithFiles = getCourseWithFiles(courseId);
    if (!courseWithFiles) throw httpError("Course not found", 404);
    if (courseWithFiles.files.length === 0)
      throw httpError("No files found in course");

    const threadId = randomUUID();
    const thread = createThread({ threadId, courseId, title });

    const materialFilesList = courseWithFiles.files
      .filter((file) => file.metadata && file.metadata.concepts)
      .map((file) => `- ${file.name}`)
      .join("\n");

    addMessage({
      threadId,
      role: "assistant",
      content: `Hello! I'm here to help you with your course materials for **${courseWithFiles.name}**.

I can see you've uploaded the following material files:
${materialFilesList}

What would you like to know about? Feel free to ask me anything about the topics in your materials!`,
    });

    return { threadId, chatThreadId: thread._id };
  });
}

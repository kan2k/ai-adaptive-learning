import { handle, httpError } from "@/server/http";
import {
  getThread,
  listMessages,
  addMessage,
  updateThread,
} from "@/server/db";
import {
  generateStreamingResponse,
  generateConversationTitle,
} from "@/server/llm/chat";
import { hasLLM, MissingApiKeyError } from "@/server/llm/providers";

export async function GET(request, { params }) {
  const { threadId } = await params;
  return handle(() => listMessages(threadId));
}

export async function POST(request, { params }) {
  const { threadId } = await params;
  return handle(async () => {
    const body = await request.json();
    const content = body.content;
    if (typeof content !== "string" || !content.trim()) {
      throw httpError("content is required");
    }

    const chatThread = getThread(threadId);
    if (!chatThread) throw httpError("Chat thread not found", 404);
    if (!hasLLM()) throw new MissingApiKeyError();

    const existingMessages = listMessages(threadId);
    const isFirstUserMessage =
      existingMessages.length === 1 &&
      existingMessages[0].role === "assistant";

    addMessage({ threadId, role: "user", content });
    updateThread(threadId, { lastMessageAt: Date.now() });

    if (isFirstUserMessage) {
      generateConversationTitle(threadId, content).catch((error) =>
        console.error("Title generation failed:", error),
      );
    }

    // Fire and forget, mirroring the original scheduler: the reply streams
    // into the messages table and the frontend picks it up by polling.
    generateStreamingResponse(threadId, chatThread.courseId).catch((error) =>
      console.error("Chat response generation failed:", error),
    );

    return { success: true, message: "Message sent and AI response scheduled" };
  });
}

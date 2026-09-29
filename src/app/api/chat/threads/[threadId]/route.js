import { handle } from "@/server/http";
import { deleteThread } from "@/server/db";

export async function DELETE(request, { params }) {
  const { threadId } = await params;
  return handle(() => {
    deleteThread(threadId);
    return null;
  });
}

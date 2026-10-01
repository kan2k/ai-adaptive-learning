import { handle, httpError } from "@/server/http";
import { getCourse, getDueFlashcards, getReviewCounts } from "@/server/db";

export async function GET(request, { params }) {
  const { id } = await params;
  return handle(() => {
    if (!getCourse(id)) throw httpError("Course not found", 404);
    return { cards: getDueFlashcards(id), counts: getReviewCounts(id) };
  }, { route: "review-queue" });
}

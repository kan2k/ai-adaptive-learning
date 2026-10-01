import { handle, httpError } from "@/server/http";
import { getFlashcardById, updateFlashcardReview } from "@/server/db";
import { scheduleReview, RATINGS } from "@/server/fsrs";

export async function POST(request, { params }) {
  const { cardId } = await params;
  return handle(async () => {
    const body = await request.json().catch(() => ({}));
    if (!RATINGS[body?.rating]) {
      throw httpError('rating must be "again", "hard", "good" or "easy"', 400);
    }
    const card = getFlashcardById(cardId);
    if (!card) throw httpError("Flashcard not found", 404);
    const next = scheduleReview(card, body.rating);
    const updated = updateFlashcardReview(cardId, next);
    return { card: updated, nextDue: updated.due };
  }, { route: "flashcard-review" });
}

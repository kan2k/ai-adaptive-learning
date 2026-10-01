import { fsrs, generatorParameters, Rating } from "ts-fsrs";

// Day-level scheduling (no intra-day learning steps), so the persisted card
// state needs no learning_steps column and a review always lands on a date.
const scheduler = fsrs(generatorParameters({ enable_short_term: false }));

export const RATINGS = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

// A brand-new card in ts-fsrs is all zeros with due = now; inserts in db.js
// rely on the same defaults without importing the library.
export function scheduleReview(cardRow, ratingName, now = new Date()) {
  const rating = RATINGS[ratingName];
  if (!rating) throw new Error(`Unknown rating: ${ratingName}`);

  const card = {
    due: new Date(cardRow.due),
    stability: cardRow.stability,
    difficulty: cardRow.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: cardRow.reps,
    lapses: cardRow.lapses,
    state: cardRow.state,
    last_review: cardRow.lastReview ? new Date(cardRow.lastReview) : undefined,
  };

  const { card: next } = scheduler.next(card, now, rating);
  return {
    due: next.due.getTime(),
    stability: next.stability,
    difficulty: next.difficulty,
    reps: next.reps,
    lapses: next.lapses,
    state: next.state,
    lastReview: next.last_review ? next.last_review.getTime() : now.getTime(),
  };
}

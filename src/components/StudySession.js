"use client";

import { useState } from "react";
import useSWR from "swr";
import { motion } from "motion/react";
import { fetcher } from "@/lib/api";
import { ReviewLoop } from "./ReviewLoop";
import { Quiz } from "./Quiz";

const SESSION_CARD_LIMIT = 10;
const SESSION_QUESTION_COUNT = 8;

// Client-side composition only: due FSRS cards first, then the existing quiz
// flow for a fixed question count, then a summary.
export function StudySession({ courseId, nextQuestionData, answerQuestion, user }) {
  const [phase, setPhase] = useState("idle"); // idle | cards | quiz | done
  const [sessionCards, setSessionCards] = useState([]);
  const [cardsReviewed, setCardsReviewed] = useState(0);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [questionsCorrect, setQuestionsCorrect] = useState(0);
  const [conceptsTouched, setConceptsTouched] = useState([]);

  const { data: reviewQueue, mutate: mutateReviewQueue } = useSWR(
    courseId ? `/api/courses/${courseId}/review-queue` : null,
    fetcher,
    { refreshInterval: 30000 },
  );
  const dueNow = reviewQueue?.counts?.dueNow || 0;

  const touchConcept = (concept) => {
    if (!concept) return;
    setConceptsTouched((prev) =>
      prev.includes(concept) ? prev : [...prev, concept],
    );
  };

  const startSession = () => {
    const cards = (reviewQueue?.cards || []).slice(0, SESSION_CARD_LIMIT);
    setSessionCards(cards);
    setCardsReviewed(0);
    setQuestionsAnswered(0);
    setQuestionsCorrect(0);
    setConceptsTouched([]);
    setPhase(cards.length > 0 ? "cards" : "quiz");
  };

  const finishSession = async () => {
    setPhase("done");
    await mutateReviewQueue();
  };

  const handleCardReviewed = (card) => {
    setCardsReviewed((n) => n + 1);
    touchConcept(card.conceptTitle);
  };

  const handleQuizAnswered = (isCorrect, concept) => {
    touchConcept(concept);
    if (isCorrect) setQuestionsCorrect((n) => n + 1);
    const answered = questionsAnswered + 1;
    setQuestionsAnswered(answered);
    if (answered >= SESSION_QUESTION_COUNT) finishSession();
  };

  if (phase === "cards") {
    return (
      <div className="h-full bg-blue-500 w-full rounded-[48px] p-8 text-xl overflow-y-auto">
        <ReviewLoop
          cards={sessionCards}
          onReviewed={handleCardReviewed}
          onFinished={() => setPhase("quiz")}
        />
      </div>
    );
  }

  if (phase === "quiz") {
    return (
      <div className="h-full w-full flex flex-col gap-2 min-h-0">
        <div className="flex justify-center">
          <div className="text-sm bg-blue-500 text-white rounded-full px-4 py-1 font-bold">
            Question {Math.min(questionsAnswered + 1, SESSION_QUESTION_COUNT)} /{" "}
            {SESSION_QUESTION_COUNT}
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <Quiz
            courseId={courseId}
            nextQuestionData={nextQuestionData}
            answerQuestion={answerQuestion}
            user={user}
            onAnswered={handleQuizAnswered}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-blue-500 w-full rounded-[48px] p-8 text-xl overflow-y-auto">
      <motion.div
        key={phase}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="h-full flex flex-col items-center justify-center gap-4 text-white text-center"
      >
        {phase === "done" ? (
          <>
            <div className="text-2xl font-bold text-shadow-black/50 text-shadow-xs">
              Session complete
            </div>
            <div className="flex flex-col gap-2 items-center text-base">
              <div className="bg-white/20 rounded-full px-4 py-1">
                {cardsReviewed} card{cardsReviewed === 1 ? "" : "s"} reviewed
              </div>
              <div className="bg-white/20 rounded-full px-4 py-1">
                {questionsCorrect} / {questionsAnswered} questions right
              </div>
              {conceptsTouched.length > 0 && (
                <div className="bg-white/20 rounded-full px-4 py-1 max-w-[480px] truncate">
                  {conceptsTouched.length} concept
                  {conceptsTouched.length === 1 ? "" : "s"}:{" "}
                  {conceptsTouched.join(", ")}
                </div>
              )}
              <div className="bg-white/20 rounded-full px-4 py-1">
                {dueNow > 0 ? `${dueNow} card${dueNow === 1 ? "" : "s"} due` : "No cards due"}
              </div>
            </div>
            <button
              onClick={startSession}
              className="bg-white text-blue-600 rounded-full px-5 py-2 font-bold hover:bg-gray-100 cursor-pointer"
            >
              Start Another Session
            </button>
          </>
        ) : (
          <>
            <button
              onClick={startSession}
              disabled={!reviewQueue}
              className="bg-white text-blue-600 rounded-full px-6 py-3 text-2xl font-bold hover:bg-gray-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start Session
            </button>
            <div className="text-sm bg-white/20 rounded-full px-4 py-1">
              {Math.min(dueNow, SESSION_CARD_LIMIT)} due card
              {Math.min(dueNow, SESSION_CARD_LIMIT) === 1 ? "" : "s"} ·{" "}
              {SESSION_QUESTION_COUNT} questions
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

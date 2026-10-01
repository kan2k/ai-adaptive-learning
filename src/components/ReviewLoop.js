"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { apiFetch } from "@/lib/api";
import { LLMContent } from "./LLMContent";
import { SourceChip } from "./SourceChip";

const RATING_BUTTONS = [
  { rating: "again", label: "Again", color: "bg-red-500" },
  { rating: "hard", label: "Hard", color: "bg-yellow-500" },
  { rating: "good", label: "Good", color: "bg-blue-500" },
  { rating: "easy", label: "Easy", color: "bg-green-600" },
];

// Plays through a fixed snapshot of due cards; the parent decides what the
// end of the queue looks like.
export function ReviewLoop({ cards, onReviewed, onFinished }) {
  const [index, setIndex] = useState(0);
  const [isPosting, setIsPosting] = useState(false);

  const card = cards[index];
  if (!card) return null;

  const handleRate = async (rating) => {
    if (isPosting) return;
    setIsPosting(true);
    try {
      const result = await apiFetch(`/api/flashcards/${card._id}/review`, {
        body: { rating },
      });
      onReviewed?.(card, rating, result);
    } catch (error) {
      console.error("Failed to record review:", error);
    } finally {
      setIsPosting(false);
    }
    if (index + 1 >= cards.length) {
      onFinished?.();
    } else {
      setIndex(index + 1);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-between gap-4">
      <div className="text-sm text-white">
        {index + 1} / {cards.length}
      </div>
      <div className="text-center flex-1 flex items-center justify-center px-4 min-h-0 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={card._id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="space-y-1 flex flex-col items-center justify-center gap-2"
          >
            <div className="text-lg font-bold text-white text-shadow-black/50 text-shadow-xs">
              {card.conceptTitle}
            </div>
            <pre className="whitespace-break-spaces font-[Menco] text-base bg-white bg-opacity-20 rounded-lg px-4 py-4 mx-8 shadow-lg text-left">
              <LLMContent content={card.flashCardText} />
            </pre>
            <SourceChip file={card.sourceFile} heading={card.sourceHeading} />
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="grid grid-cols-4 gap-2 w-full max-w-[560px]">
        {RATING_BUTTONS.map(({ rating, label, color }) => (
          <button
            key={rating}
            onClick={() => handleRate(rating)}
            disabled={isPosting}
            className={`${color} hover:opacity-80 transition-opacity rounded-2xl px-4 py-3 text-white font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import useSWR from "swr";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DotPattern } from "@/components/magicui/dot-pattern";
import { cn } from "@/lib/utils";
import { fetcher } from "@/lib/api";
import { LLMContent } from "./LLMContent";
import { ReviewLoop } from "./ReviewLoop";
import { SourceChip } from "./SourceChip";

export function Flashcard({ flashcards, courseId }) {
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [mode, setMode] = useState("browse"); // 'browse' | 'review' | 'done'
  const [reviewCards, setReviewCards] = useState([]);
  const [reviewedCount, setReviewedCount] = useState(0);

  const { data: reviewQueue, mutate: mutateReviewQueue } = useSWR(
    courseId ? `/api/courses/${courseId}/review-queue` : null,
    fetcher,
    { refreshInterval: 30000 },
  );
  const dueNow = reviewQueue?.counts?.dueNow || 0;

  const startReview = () => {
    if (!reviewQueue?.cards?.length) return;
    setReviewCards(reviewQueue.cards);
    setReviewedCount(0);
    setMode("review");
  };

  const finishReview = async () => {
    setMode("done");
    await mutateReviewQueue();
  };

  // Reset flashcard index when flashcards change
  useEffect(() => {
    setCurrentFlashcardIndex(0);
  }, [flashcards]);

  useEffect(() => {
    setMode("browse");
    setReviewCards([]);
    setReviewedCount(0);
  }, [courseId]);

  // Flashcard navigation functions
  const nextFlashcard = () => {
    if (flashcards.length > 0) {
      setCurrentFlashcardIndex((prev) => (prev + 1) % flashcards.length);
    }
  };

  const prevFlashcard = () => {
    if (flashcards.length > 0) {
      setCurrentFlashcardIndex((prev) =>
        prev === 0 ? flashcards.length - 1 : prev - 1,
      );
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (flashcards.length <= 1) return;

      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          nextFlashcard();
          break;
        case "ArrowLeft":
          event.preventDefault();
          prevFlashcard();
          break;
        default:
          break;
      }
    };

    // Add event listener
    window.addEventListener("keydown", handleKeyDown);

    // Cleanup event listener
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [flashcards.length]);

  const currentFlashcard =
    flashcards.length > 0 ? flashcards[currentFlashcardIndex] : null;

  return (
    <div className="h-full bg-green-500 w-full rounded-[48px] p-8 text-xl relative">
      <DotPattern
        className={cn(
          "[mask-image:radial-gradient(500px_circle_at_center,white,transparent)] z-0",
        )}
      />
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-between">
        {mode === "review" && reviewCards.length > 0 ? (
          <ReviewLoop
            cards={reviewCards}
            onReviewed={() => setReviewedCount((n) => n + 1)}
            onFinished={finishReview}
          />
        ) : mode === "done" ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="flex-1 flex flex-col items-center justify-center gap-4 text-white text-center"
          >
            <div className="text-2xl font-bold text-shadow-black/50 text-shadow-xs">
              Reviewed {reviewedCount} card{reviewedCount === 1 ? "" : "s"}
            </div>
            <div className="text-sm bg-white/20 rounded-full px-4 py-1">
              {dueNow > 0 ? `${dueNow} still due` : "All caught up"}
            </div>
            <button
              onClick={() => setMode("browse")}
              className="bg-white text-green-600 rounded-full px-5 py-2 font-bold hover:bg-gray-100 cursor-pointer"
            >
              Back to cards
            </button>
          </motion.div>
        ) : (
          <>
            {dueNow > 0 && (
              <button
                onClick={startReview}
                className="bg-white text-green-600 rounded-full px-5 py-2 font-bold hover:bg-gray-100 cursor-pointer"
              >
                Review ({dueNow} due)
              </button>
            )}

            {/* Flashcard Content */}
            <div className="text-center flex-1 flex items-center justify-center px-4">
              {currentFlashcard ? (
                <div className="space-y-1 flex flex-col items-center justify-center gap-2">
                  <div className="text-lg font-bold text-white text-shadow-black/50 text-shadow-xs">
                    {currentFlashcard.conceptTitle}
                  </div>
                  <pre className="whitespace-break-spaces font-[Menco] text-base bg-white bg-opacity-20 rounded-lg px-4 py-4 mx-8 shadow-lg text-left">
                    <LLMContent content={currentFlashcard.flashCardText} />
                  </pre>
                  {currentFlashcard.suggestionImage && (
                    <div className="text-sm bg-white rounded-lg px-4 py-2 w-[400px]">
                      {currentFlashcard.suggestionImage}
                    </div>
                  )}
                  <SourceChip
                    file={currentFlashcard.sourceFile}
                    heading={currentFlashcard.sourceHeading}
                  />
                </div>
              ) : flashcards.length === 0 ? (
                <div className="text-center">
                  <div className="text-sm text-green-100"></div>
                </div>
              ) : (
                "Loading..."
              )}
            </div>

            {/* Navigation Controls */}
            <div className="flex flex-row gap-4 items-center">
              <Button
                variant="ghost"
                className="h-8 w-8"
                onClick={prevFlashcard}
                disabled={flashcards.length <= 1}
              >
                <ChevronLeft className="size-4" />
              </Button>

              {/* Flashcard counter */}
              {flashcards.length > 0 && (
                <span className="text-sm">
                  {currentFlashcardIndex + 1} / {flashcards.length}
                </span>
              )}

              <Button
                variant="ghost"
                className="h-8 w-8"
                onClick={nextFlashcard}
                disabled={flashcards.length <= 1}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Flashcard({ flashcards }) {
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);

  // Reset flashcard index when flashcards change
  useEffect(() => {
    setCurrentFlashcardIndex(0);
  }, [flashcards]);

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

  const currentFlashcard =
    flashcards.length > 0 ? flashcards[currentFlashcardIndex] : null;

  return (
    <div className="basis-[30%] bg-green-500 w-full rounded-l-[48px] rounded-r-[12px] p-8 text-xl">
      <div className="w-full h-full flex flex-col items-center justify-between">
        {/* <div className="text-sm">Flash Cards</div> */}

        {/* Flashcard Content */}
        <div className="text-center flex-1 flex items-center justify-center px-4">
          {currentFlashcard ? (
            <div className="space-y-1 flex flex-col items-center justify-center">
              <div className="text-lg font-bold text-white">
                {currentFlashcard.conceptTitle}
              </div>
              <div className="text-base bg-white bg-opacity-20 rounded-lg px-4 py-4 mx-8 leading-5">
                {currentFlashcard.flashCardText}
              </div>
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
      </div>
    </div>
  );
}

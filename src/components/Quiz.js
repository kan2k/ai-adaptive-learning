"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Triangle,
  Diamond,
  Circle,
  Square,
  Lightbulb,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DotPattern } from "./magicui/dot-pattern";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { SourceChip } from "./SourceChip";

export const Quiz = ({ courseId, nextQuestionData, answerQuestion, user }) => {
  const [questionStyle, setQuestionStyle] = useState("enhanced"); // 'original' or 'enhanced'
  const previousCourseIdRef = useRef(courseId);
  const [currentQuestion, setCurrentQuestion] = useState({
    question: "",
    questionRephrased: "",
    difficulty: "",
    answers: [],
    correctAnswer: "",
    hint: "",
    message: "",
  });
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [isLoadingNextQuestion, setIsLoadingNextQuestion] = useState(false);
  const [displayedMessage, setDisplayedMessage] = useState("");
  // Explanations cache keyed by question text so revisiting a wrong answer
  // never re-calls the LLM.
  const [explanations, setExplanations] = useState({});
  const [isExplaining, setIsExplaining] = useState(false);

  const answeredWrong =
    isAnswerSubmitted &&
    selectedAnswer !== null &&
    currentQuestion.answers[selectedAnswer] !== currentQuestion.correctAnswer;
  const explanation = explanations[currentQuestion.question];

  useEffect(() => {
    if (!answeredWrong || !courseId || !currentQuestion.question) return;
    if (explanations[currentQuestion.question] !== undefined) return;
    let cancelled = false;
    setIsExplaining(true);
    apiFetch(`/api/courses/${courseId}/explain`, {
      body: {
        question: currentQuestion.question,
        answers: currentQuestion.answers,
        chosen: currentQuestion.answers[selectedAnswer],
        correct: currentQuestion.correctAnswer,
        concept: nextQuestionData?.enhancedQuestion?.conceptCovered || "",
      },
    })
      .then((data) => {
        if (!cancelled) {
          setExplanations((prev) => ({
            ...prev,
            [currentQuestion.question]: data.explanation,
          }));
        }
      })
      .catch((error) => {
        console.error("Failed to fetch explanation:", error);
        if (!cancelled) {
          setExplanations((prev) => ({
            ...prev,
            [currentQuestion.question]: null,
          }));
        }
      })
      .finally(() => {
        if (!cancelled) setIsExplaining(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answeredWrong, courseId, currentQuestion.question]);

  // Update local state when nextQuestionData changes (new question available)
  useEffect(() => {
    if (
      nextQuestionData &&
      nextQuestionData.originalQuestion &&
      nextQuestionData.enhancedQuestion
    ) {
      const questionData =
        questionStyle === "original"
          ? nextQuestionData.originalQuestion
          : nextQuestionData.enhancedQuestion;

      // Always update the question if it's different from current question
      // or if there's no current question
      const shouldUpdateQuestion =
        !currentQuestion.question ||
        currentQuestion.question !== questionData.question ||
        !isAnswerSubmitted;

      if (shouldUpdateQuestion) {
        const newQuestionState = {
          question: questionData.question || "",
          questionRephrased:
            questionStyle === "enhanced"
              ? nextQuestionData.enhancedQuestion.questionRephrased || ""
              : "",
          difficulty:
            questionStyle === "enhanced"
              ? nextQuestionData.enhancedQuestion.difficulty || ""
              : "",
          answers: questionData.answers || [],
          correctAnswer: questionData.correctAnswer || "",
          hint:
            questionStyle === "enhanced"
              ? nextQuestionData.enhancedQuestion.hint || ""
              : "",
          message: nextQuestionData.message || "",
        };
        setCurrentQuestion(newQuestionState);

        // Reset answer states if this is a new question
        if (
          currentQuestion.question &&
          currentQuestion.question !== questionData.question
        ) {
          setSelectedAnswer(null);
          setIsAnswerSubmitted(false);
          setShowHint(false);
        }
      } else {
        // Just update the message if we're not updating the full question
        setCurrentQuestion((prev) => ({
          ...prev,
          message: nextQuestionData.message || prev.message,
        }));
      }
    } else {
      console.log(
        "No valid question data available - nextQuestionData:",
        nextQuestionData,
      );
    }
  }, [nextQuestionData, isAnswerSubmitted, questionStyle]);

  // Reset answer states when course changes
  useEffect(() => {
    // Only reset if courseId actually changed (not on initial mount or tab switch)
    if (
      previousCourseIdRef.current &&
      previousCourseIdRef.current !== courseId
    ) {
      setSelectedAnswer(null);
      setIsAnswerSubmitted(false);
      setShowHint(false);
      setCurrentQuestion({
        question: "",
        questionRephrased: "",
        difficulty: "",
        answers: [],
        correctAnswer: "",
        hint: "",
        message: "",
      });
      setDisplayedMessage("");
      setQuestionStyle("enhanced");
      setExplanations({});
    }

    // Update the ref for next time
    previousCourseIdRef.current = courseId;
  }, [courseId]);

  // Typing animation effect for message
  useEffect(() => {
    if (!currentQuestion.message) {
      setDisplayedMessage("");
      return;
    }
    setDisplayedMessage("");
    let currentIndex = 0;
    const typingInterval = setInterval(() => {
      if (currentIndex < currentQuestion.message.length) {
        setDisplayedMessage(currentQuestion.message.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        clearInterval(typingInterval);
      }
    }, 30);
    return () => clearInterval(typingInterval);
  }, [currentQuestion.message]);

  const handleAnswerClick = async (answerIndex, answerText) => {
    if (isAnswerSubmitted || !user?.id || !nextQuestionData) {
      return;
    }
    setSelectedAnswer(answerIndex);
    setIsAnswerSubmitted(true);
    setIsSubmittingAnswer(true);

    try {
      await answerQuestion({
        answer: answerText,
        courseId: courseId,
      });
    } catch (error) {
      console.error("Failed to submit answer - Full error:", error);
      setSelectedAnswer(null);
      setIsAnswerSubmitted(false);
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const handleNextQuestion = async () => {
    setIsLoadingNextQuestion(true);
    setSelectedAnswer(null);
    setIsAnswerSubmitted(false);
    setShowHint(false);
    if (
      nextQuestionData &&
      nextQuestionData.originalQuestion &&
      nextQuestionData.enhancedQuestion
    ) {
      const questionData =
        questionStyle === "original"
          ? nextQuestionData.originalQuestion
          : nextQuestionData.enhancedQuestion;

      setCurrentQuestion({
        question: questionData.question || "",
        questionRephrased:
          questionStyle === "enhanced"
            ? nextQuestionData.enhancedQuestion.questionRephrased || ""
            : "",
        difficulty:
          questionStyle === "enhanced"
            ? nextQuestionData.enhancedQuestion.difficulty || ""
            : "",
        answers: questionData.answers || [],
        correctAnswer: questionData.correctAnswer || "",
        hint:
          questionStyle === "enhanced"
            ? nextQuestionData.enhancedQuestion.hint || ""
            : "",
        message: nextQuestionData.message || "",
      });
    }
    setIsLoadingNextQuestion(false);
  };

  const getAnswerButtonStyle = (answerIndex, baseColor) => {
    if (!isAnswerSubmitted) {
      return `${baseColor} hover:opacity-80 transition-opacity`;
    }
    const isCorrectAnswer =
      currentQuestion.correctAnswer === currentQuestion.answers[answerIndex];
    const isSelectedAnswer = selectedAnswer === answerIndex;

    if (isCorrectAnswer) {
      return "bg-green-600 border-2 border-green-400";
    } else if (isSelectedAnswer && !isCorrectAnswer) {
      return "bg-red-600 border-2 border-red-400";
    } else {
      return `${baseColor} opacity-50`;
    }
  };

  return (
    <div className="h-full bg-purple-500 border-purple-400 w-full rounded-[48px] p-8 text-xl overflow-y-auto">
      <div className="relative z-10 flex flex-col h-full gap-4">
        <div className="relative flex flex-row gap-4">
          <div className="size-17 aspect-square bg-black self-end">
            <Image
              src="/Tutors/steve.png"
              className="h-full w-full object-cover"
              alt=""
              width={68}
              height={68}
            />
          </div>
          {currentQuestion.message && (
            <div className="bg-white rounded-t-[24px] rounded-br-[24px] px-4 py-3 relative min-h-[68px] flex items-center">
              {displayedMessage}
            </div>
          )}
        </div>
        <div className="flex flex-col h-full justify-between">
          <div className="flex flex-col items-center justify-center text-white text-2xl text-center gap-4 h-full">
            <div className="flex items-center justify-center leading-7 w-[80%]">
              {(() => {
                return (
                  currentQuestion.questionRephrased ||
                  currentQuestion.question ||
                  (!nextQuestionData
                    ? "No question data available. Please start the course first."
                    : "Loading question...")
                );
              })()}
            </div>
            {currentQuestion.question && nextQuestionData?.source && (
              <SourceChip
                file={nextQuestionData.source.fileName}
                heading={nextQuestionData.source.heading}
              />
            )}
          </div>
          <div className="flex flex-col gap-2">
            {answeredWrong && (explanation || isExplaining) && (
              <div className="mb-2 flex justify-center">
                <div className="bg-white/15 text-white text-sm font-normal rounded-2xl px-4 py-3 max-w-[560px] flex items-center gap-2">
                  {explanation || <Spinner className="h-4 w-4" />}
                </div>
              </div>
            )}
            {isAnswerSubmitted && (
              <div className="mb-2 flex justify-center">
                <Button
                  onClick={handleNextQuestion}
                  disabled={isSubmittingAnswer || isLoadingNextQuestion}
                  className="bg-white text-purple-600 hover:bg-gray-100 font-bold flex items-center gap-2"
                >
                  {isSubmittingAnswer || isLoadingNextQuestion ? (
                    <>
                      <Spinner className="h-4 w-4" />
                      Loading New Question...
                    </>
                  ) : (
                    "Next Question →"
                  )}
                </Button>
              </div>
            )}
            {!isAnswerSubmitted && (
              <div className="mb-2 flex justify-center flex-row gap-2 items-center">
                {currentQuestion?.difficulty && (
                  <div className="justify-center bg-white text-purple-600 hover:bg-gray-100 font-bold flex items-center gap-1 capitalize text-sm rounded-full px-4 py-1">
                    {currentQuestion.difficulty}
                  </div>
                )}
                {nextQuestionData?.originalQuestion && (
                  <div className="flex items-center justify-center text-sm font-normal">
                    <button
                      onClick={() => setQuestionStyle("enhanced")}
                      className={`px-3 py-1 rounded-l-full font-bold font-[Menco] ${
                        questionStyle === "enhanced"
                          ? "bg-white text-purple-600"
                          : "bg-purple-400 text-white"
                      }`}
                    >
                      Enhanced
                    </button>
                    <button
                      onClick={() => setQuestionStyle("original")}
                      className={`px-3 py-1 rounded-r-full font-bold font-[Menco] ${
                        questionStyle === "original"
                          ? "bg-white text-purple-600"
                          : "bg-purple-400 text-white"
                      }`}
                    >
                      Original
                    </button>
                  </div>
                )}
                {!isAnswerSubmitted &&
                  currentQuestion.hint &&
                  !showHint &&
                  questionStyle === "enhanced" && (
                    <div className="flex justify-center flex-row gap-2 items-center">
                      <button
                        onClick={() => setShowHint(true)}
                        className="rounded-full text-sm px-4 py-1 bg-white text-purple-600 hover:bg-gray-100 font-bold flex items-center gap-1 flex-row"
                      >
                        <Lightbulb className="h-4 w-4 mb-0.5 text-yellow-500" />
                        <div className="">Show Hint</div>
                      </button>
                    </div>
                  )}
              </div>
            )}
            {showHint &&
              currentQuestion.hint &&
              questionStyle === "enhanced" && (
                <div className="mb-2 flex justify-center">
                  <div className="text-white text-center text-sm">
                    💡{currentQuestion.hint}
                  </div>
                </div>
              )}
            {currentQuestion.answers?.length === 4 ? (
              currentQuestion.answers.map((answer, index) => {
                const icons = [Triangle, Diamond, Circle, Square];
                const colors = [
                  "bg-red-500",
                  "bg-blue-500",
                  "bg-yellow-500",
                  "bg-green-600",
                ];
                const Icon = icons[index];
                const isCorrectAnswer =
                  currentQuestion.correctAnswer === answer;
                const isSelectedAnswer = selectedAnswer === index;

                return (
                  <button
                    key={index}
                    onClick={() => handleAnswerClick(index, answer)}
                    disabled={isAnswerSubmitted || isSubmittingAnswer}
                    className={`${getAnswerButtonStyle(
                      index,
                      colors[index],
                    )} rounded-2xl p-4 text-white text-lg  cursor-pointer disabled:cursor-not-allowed flex flex-row gap-2 items-center justify-between`}
                  >
                    <div className="flex flex-row gap-2 items-center">
                      <Icon className="min-h-6 min-w-6" />
                      <div className="text-left">{answer}</div>
                    </div>
                    {isAnswerSubmitted && (
                      <div className="ml-2">
                        {isCorrectAnswer ? (
                          <Check className="h-5 w-5 text-white" />
                        ) : isSelectedAnswer && !isCorrectAnswer ? (
                          <X className="h-5 w-5 text-white" />
                        ) : null}
                      </div>
                    )}
                  </button>
                );
              })
            ) : (
              <>
                <button className="bg-red-500 rounded-2xl p-4 flex flex-row gap-2 text-white text-lg opacity-50">
                  <Triangle />
                  <span>Loading...</span>
                </button>
                <button className="bg-blue-500 rounded-2xl p-4 flex flex-row gap-2 text-white text-lg opacity-50">
                  <Diamond />
                  <span>Loading...</span>
                </button>
                <button className="bg-yellow-500 rounded-2xl p-4 flex flex-row gap-2 text-white text-lg opacity-50">
                  <Circle />
                  <span>Loading...</span>
                </button>
                <button className="bg-green-600 rounded-2xl p-4 flex flex-row gap-2 text-white text-lg opacity-50">
                  <Square />
                  <span>Loading...</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

"use client";
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
  useQuery,
  useMutation,
  useAction,
  useConvexAuth,
} from "convex/react";
import { SignIn, useUser } from "@clerk/clerk-react";
import { api } from "../../convex/_generated/api";
import { useState, useEffect, useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Circle,
  Diamond,
  Square,
  Triangle,
  Lightbulb,
  Check,
  X,
  MoreVertical,
  Share2,
  RefreshCcw,
  Trash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import UploadDropZone from "@/components/UploadDropZone";
import UploadedFiles from "@/components/UploadedFiles";
import { StripBackground } from "@/components/StripBackground";
import { shadesOfPurple } from "@clerk/themes";
import { Navbar } from "@/components/Navbar";
import { Flashcard } from "@/components/Flashcard";
import Image from "next/image";
import { Preferences } from "@/components/Preferences";

export default function Page() {
  const { user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [isStartingCourse, setIsStartingCourse] = useState(false);
  const [questionStyle, setQuestionStyle] = useState("enhanced"); // 'original' or 'enhanced'

  // Consolidated local learning data state
  const [currentQuestion, setCurrentQuestion] = useState({
    question: "",
    questionRephrased: "",
    difficulty: "",
    answers: [],
    correctAnswer: "",
    hint: "",
    message: "",
  });

  // UI state for answer interaction
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [isLoadingNextQuestion, setIsLoadingNextQuestion] = useState(false);

  // Typing animation state
  const [displayedMessage, setDisplayedMessage] = useState("");

  const nameInputRef = useRef(null);

  const courses = useQuery(
    api.courses.getCourses,
    user?.id ? { userId: user.id } : "skip",
  );

  const preferences = useQuery(
    api.users.getPreferences,
    isAuthenticated ? {} : "skip",
  );

  const files = useQuery(
    api.files.getFiles,
    selectedCourse?._id ? { courseId: selectedCourse._id } : "skip",
  );

  const learningData = useQuery(
    api.courses.getLearningData,
    selectedCourse?._id ? { courseId: selectedCourse._id } : "skip",
  );

  // Extract individual data from learningData
  const nextQuestionData = learningData?.nextQuestion || null;
  const flashcards = learningData?.flashcards || [];

  const selectedFiles = useQuery(
    api.courses.getSelectedFilesWithDetails,
    selectedCourse?._id ? { courseId: selectedCourse._id } : "skip",
  );

  const updateCourseName = useMutation(api.courses.updateCourseName);
  const startCourse = useAction(api.courses.startCourse);
  const answerQuestion = useAction(api.llm.tutorAgent.agent.answerQuestion);

  // Check if all files have metadata generated
  const allFilesHaveMetadata =
    files && files.length > 0 && files.every((file) => file.metadata);
  const hasFiles = files && files.length > 0;
  const isReadyToStart = hasFiles && allFilesHaveMetadata;
  const courseStarted = learningData?.nextQuestion && learningData?.flashcards;

  // Set the most recent course as default when courses load
  useEffect(() => {
    if (courses && courses.length > 0) {
      // If no course is selected, or if the selected course is no longer in the list, select the most recent one
      if (
        !selectedCourse ||
        !courses.find((course) => course._id === selectedCourse._id)
      ) {
        setSelectedCourse(courses[0]); // First course is most recently opened due to sorting
      }
    }
  }, [courses, selectedCourse]);

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

      // Only update question/answers if we're not currently in the middle of an answer flow
      // OR if this is the first time we're getting data
      if (
        !isAnswerSubmitted ||
        (!currentQuestion.question && questionData.question)
      ) {
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
      } else {
        // Only update the message if we're in the middle of an answer flow
        setCurrentQuestion((prev) => ({
          ...prev,
          message: nextQuestionData.message || prev.message,
        }));
      }
    }
  }, [
    nextQuestionData,
    isAnswerSubmitted,
    currentQuestion.question,
    questionStyle,
  ]);

  // Reset answer states when course changes
  useEffect(() => {
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
  }, [selectedCourse]);

  // Typing animation effect for message
  useEffect(() => {
    if (!currentQuestion.message) {
      setDisplayedMessage("");
      return;
    }

    // Start typing animation
    setDisplayedMessage("");

    let currentIndex = 0;
    const typingInterval = setInterval(() => {
      if (currentIndex < currentQuestion.message.length) {
        setDisplayedMessage(currentQuestion.message.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        clearInterval(typingInterval);
      }
    }, 30); // Adjust speed by changing this value (lower = faster)

    return () => clearInterval(typingInterval);
  }, [currentQuestion.message]);

  const handleStartCourse = async () => {
    if (!selectedCourse || !user?.id) {
      console.error("No course selected or user not authenticated");
      return;
    }

    setIsStartingCourse(true);
    try {
      const result = await startCourse({
        courseId: selectedCourse._id,
        userId: user.id,
      });
      console.log("Course started successfully:", result);
    } catch (error) {
      console.error("Failed to start course:", error);
    } finally {
      setIsStartingCourse(false);
    }
  };

  const handleAnswerClick = async (answerIndex, answerText) => {
    console.log("handleAnswerClick called:", {
      answerIndex,
      answerText,
      isAnswerSubmitted,
      userId: user?.id,
      hasNextQuestion: !!nextQuestionData,
      courseId: selectedCourse?._id,
    });

    if (isAnswerSubmitted || !user?.id || !nextQuestionData) {
      console.log("Early return from handleAnswerClick due to conditions");
      return;
    }

    setSelectedAnswer(answerIndex);
    setIsAnswerSubmitted(true);
    setIsSubmittingAnswer(true);

    try {
      console.log("Calling answerQuestion with:", {
        answer: answerText,
        courseId: selectedCourse._id,
      });

      const result = await answerQuestion({
        answer: answerText,
        courseId: selectedCourse._id,
      });

      console.log("Answer submitted successfully:", result);
      // The UI will automatically update via reactive queries when the agent completes
    } catch (error) {
      console.error("Failed to submit answer - Full error:", error);
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      // Reset states on error
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

  const handleStartEditing = () => {
    if (selectedCourse) {
      setEditingName(selectedCourse.name);
      setIsEditingName(true);
    }
  };

  const handleFinishEditing = async () => {
    if (!selectedCourse || !user?.id || !editingName.trim()) {
      setIsEditingName(false);
      return;
    }

    try {
      await updateCourseName({
        courseId: selectedCourse._id,
        name: editingName.trim(),
        userId: user.id,
      });

      // Update the selected course state immediately
      setSelectedCourse({
        ...selectedCourse,
        name: editingName.trim(),
      });

      setIsEditingName(false);
    } catch (error) {
      console.error("Failed to update course name:", error);
      setIsEditingName(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleFinishEditing();
    } else if (e.key === "Escape") {
      setIsEditingName(false);
      setEditingName("");
    }
  };

  // Focus the input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // Helper function to get button style based on answer state
  const getAnswerButtonStyle = (answerIndex, baseColor) => {
    if (!isAnswerSubmitted) {
      // Normal state - show hover effects
      return `${baseColor} hover:opacity-80 transition-opacity`;
    }

    // Answer submitted - show correct/incorrect states
    const isCorrectAnswer =
      currentQuestion.correctAnswer === currentQuestion.answers[answerIndex];
    const isSelectedAnswer = selectedAnswer === answerIndex;

    if (isCorrectAnswer) {
      // This is the correct answer - always show as green
      return "bg-green-600 border-2 border-green-400";
    } else if (isSelectedAnswer && !isCorrectAnswer) {
      // This was the selected wrong answer - show as red
      return "bg-red-600 border-2 border-red-400";
    } else {
      // Other answers - show as faded
      return `${baseColor} opacity-50`;
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-yellow-300 font-[Menco]">
      <StripBackground />
      <Authenticated>
        {preferences === null ? (
          <div className="z-10 relative flex flex-col h-full gap-4 items-center w-full justify-center">
            <div className="text-2xl font-bold text-white">
              {"Let's get started by setting your study preferences"}
            </div>
            <div className="max-w-[800px] bg-blue-500 border-blue-400 border-4 p-6 rounded-lg ">
              <Preferences />
            </div>
          </div>
        ) : (
          <div className="z-10 relative flex flex-col h-full w-full font-bold gap-5">
            <Navbar
              courses={courses}
              selectedCourse={selectedCourse}
              setSelectedCourse={setSelectedCourse}
            />
            <div className="flex flex-row flex-1 gap-4 mx-4 mb-4 min-h-0">
              <div className="w-[38.2%] bg-orange-300 h-full rounded-l-[12px] rounded-r-[48px] p-8 overflow-y-auto">
                {courses && courses.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center">
                    <div className="flex flex-col items-center justify-center h-full">
                      <div className="font-bold text-xl">
                        🤔 Looking kind of empty here...
                      </div>
                      <div className="text-base">
                        Get started by creating a course
                      </div>
                    </div>
                  </div>
                )}

                {selectedCourse && (
                  <div className="mb-4">
                    <div className="flex flex-row gap-2 justify-between">
                      {isEditingName ? (
                        <input
                          ref={nameInputRef}
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={handleFinishEditing}
                          onKeyDown={handleKeyPress}
                          className="font-bold text-2xl bg-transparent border-none outline-none focus:bg-white focus:ring-2 focus:ring-blue-400 rounded px-2 py-1 w-full"
                        />
                      ) : (
                        <div
                          className="font-bold text-2xl cursor-pointer hover:bg-white hover:bg-opacity-20 rounded px-2 py-1 transition-colors"
                          onClick={handleStartEditing}
                          title="Click to edit name"
                        >
                          {selectedCourse.name}
                        </div>
                      )}
                      <div className="h-full pt-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="h-full flex items-center hover:cursor-pointer">
                            <MoreVertical className="h-5 w-5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="p-2 font-[Menco]">
                            <DropdownMenuItem>
                              <Share2 className="h-5 w-5" />
                              Share
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <RefreshCcw /> Restart
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Trash /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                )}

                {selectedCourse && (
                  <div className="flex flex-col gap-4">
                    <div className="">
                      <UploadDropZone courseId={selectedCourse._id} />
                    </div>

                    <div className="overflow-y-auto">
                      <UploadedFiles courseId={selectedCourse._id} />
                    </div>

                    {learningData?.studentProgress && (
                      <div className="overflow-y-auto w-full rounded-lg flex flex-col gap-2">
                        <div className="flex flex-col divide-y">
                          {Object.keys(learningData?.studentProgress).map(
                            (conceptName, index) => (
                              <div
                                key={conceptName}
                                className="flex flex-col bg-white text-black p-4 gap-2 text-sm"
                              >
                                <div className="flex flex-row justify-between items-center">
                                  <div className="">
                                    {index + 1}. {conceptName}
                                  </div>
                                  <div className="capitalize text-xs bg-orange-400 text-white rounded-full px-2">
                                    {
                                      learningData?.studentProgress[conceptName]
                                        .mastery
                                    }
                                  </div>
                                </div>
                                <div className="flex flex-row justify-between items-center gap-2">
                                  {learningData?.studentProgress[conceptName]
                                    .percentage === 0 ? (
                                    <div className="text-gray-500 text-xs italic font-light">
                                      No progress yet
                                    </div>
                                  ) : (
                                    <div
                                      className={`bg-orange-400 rounded-full h-2`}
                                      style={{
                                        width: `${
                                          learningData?.studentProgress[
                                            conceptName
                                          ].percentage
                                        }%`,
                                      }}
                                    ></div>
                                  )}
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="basis-[61.8%] relative flex items-center justify-center">
                {/* Loading overlay during course preparation */}
                {isStartingCourse && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center z-20 rounded-l-[48px] rounded-r-[12px]">
                    <Spinner size="xl" className="text-white mb-4" />
                    <div className="text-white text-xl font-bold text-shadow-black">
                      Preparing...
                    </div>
                  </div>
                )}

                {/* Ready to start overlay */}
                {!courseStarted && !isStartingCourse && (
                  <div className="absolute self-center z-10 flex flex-col gap-1 rounded-lg px-8 py-4">
                    <div className="text-center  text-white text-xl text-shadow-black">
                      {!hasFiles
                        ? "Upload some files to get started"
                        : !allFilesHaveMetadata
                          ? "Processing files..."
                          : "Are you ready to start?"}
                    </div>
                    <Button
                      variant="outline"
                      className="bg-white text-black font-[Menco] font-bold"
                      disabled={!isReadyToStart}
                      onClick={handleStartCourse}
                    >
                      Let&apos;s GO!
                    </Button>
                  </div>
                )}
                <div
                  className={`${courseStarted ? "" : "blur-sm"} flex flex-col h-full w-full gap-4`}
                >
                  <Flashcard flashcards={flashcards} />
                  <div className="basis-[70%] bg-purple-500 border-purple-400 w-full rounded-l-[48px] rounded-r-[12px] p-8 text-xl">
                    <div className="flex flex-col h-full gap-4">
                      <div className="flex flex-row gap-4">
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
                        <div className="h-full flex flex-col items-center justify-center text-white text-2xl text-center gap-4">
                          <div className="flex items-center justify-center leading-7 w-[80%]">
                            {currentQuestion.questionRephrased ||
                              currentQuestion.question ||
                              "Loading question..."}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          {/* Next Question Button - shows after answer is submitted */}
                          {isAnswerSubmitted && (
                            <div className="mb-2 flex justify-center">
                              <Button
                                onClick={handleNextQuestion}
                                disabled={
                                  isSubmittingAnswer || isLoadingNextQuestion
                                }
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

                          {/* Hint Display - shows when hint button is clicked */}
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
                                  onClick={() =>
                                    handleAnswerClick(index, answer)
                                  }
                                  disabled={
                                    isAnswerSubmitted || isSubmittingAnswer
                                  }
                                  className={`${getAnswerButtonStyle(index, colors[index])} rounded-2xl p-4 text-white text-lg  cursor-pointer disabled:cursor-not-allowed flex flex-row gap-2 items-center justify-between`}
                                >
                                  <div className="flex flex-row gap-2 items-center">
                                    <Icon className="min-h-6 min-w-6" />
                                    <div className="text-left">{answer}</div>
                                  </div>

                                  {/* Show correct/incorrect icons after submission */}
                                  {isAnswerSubmitted && (
                                    <div className="ml-2">
                                      {isCorrectAnswer ? (
                                        <Check className="h-5 w-5 text-white" />
                                      ) : isSelectedAnswer &&
                                        !isCorrectAnswer ? (
                                        <X className="h-5 w-5 text-white" />
                                      ) : null}
                                    </div>
                                  )}
                                </button>
                              );
                            })
                          ) : (
                            // Placeholder buttons while loading
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
                </div>
              </div>
            </div>
          </div>
        )}
      </Authenticated>

      <Unauthenticated>
        <div className="flex flex-row gap-4 mx-4 mb-4 items-center justify-center h-full w-full">
          <SignIn
            appearance={{
              baseTheme: shadesOfPurple,
              variables: {
                fontSize: "1rem",
                borderRadius: "0.55rem",
                spacing: "1rem",
              },
            }}
          />
        </div>
      </Unauthenticated>

      <AuthLoading>
        <div className="flex flex-row gap-4 mx-4 mb-4 items-center justify-center h-full w-full">
          <Spinner size="xl" className="text-white mb-4" />
        </div>
      </AuthLoading>
    </div>
  );
}

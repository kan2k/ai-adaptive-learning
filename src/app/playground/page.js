"use client";

import { SignInButton, UserButton, useUser } from "@clerk/clerk-react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useEffect, useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Book,
  ChevronDownIcon,
  ChevronLeft,
  ChevronRight,
  Circle,
  Diamond,
  PlusIcon,
  Square,
  Triangle,
  Lightbulb,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import UploadDropZone from "@/components/UploadDropZone";
import UploadedFiles from "@/components/UploadedFiles";

export default function Page() {
  const { user } = useUser();
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [isStartingCourse, setIsStartingCourse] = useState(false);
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);

  // Local state for current question/answer flow
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [currentQuestionRephrased, setCurrentQuestionRephrased] = useState("");
  const [currentAnswers, setCurrentAnswers] = useState([]);
  const [currentCorrectAnswer, setCurrentCorrectAnswer] = useState("");
  const [currentHint, setCurrentHint] = useState("");
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [isAnswerCorrect, setIsAnswerCorrect] = useState(false);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [isLoadingNextQuestion, setIsLoadingNextQuestion] = useState(false);
  const [currentMessage, setCurrentMessage] = useState("");

  const nameInputRef = useRef(null);

  const courses = useQuery(
    api.courses.getCourses,
    user?.id ? { userId: user.id } : "skip",
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
  const studentProgressReport = learningData?.studentProgressReport || "";

  const selectedFiles = useQuery(
    api.courses.getSelectedFilesWithDetails,
    selectedCourse?._id ? { courseId: selectedCourse._id } : "skip",
  );

  const updateLastOpened = useMutation(api.courses.updateLastOpened);
  const createCourse = useMutation(api.courses.createCourse);
  const updateCourseName = useMutation(api.courses.updateCourseName);
  const startCourse = useAction(api.courses.startCourse);
  const answerQuestion = useAction(api.llm.tutorAgent.agent.answerQuestion);

  // Check if all files have metadata generated
  const allFilesHaveMetadata =
    files && files.length > 0 && files.every((file) => file.metadata);
  const hasFiles = files && files.length > 0;
  const isReadyToStart = hasFiles && allFilesHaveMetadata;
  const courseStarted = selectedCourse?.threadId || nextQuestionData;

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

  // Reset flashcard index when course changes
  useEffect(() => {
    setCurrentFlashcardIndex(0);
  }, [selectedCourse]);

  // Update local state when nextQuestionData changes (new question available)
  useEffect(() => {
    if (nextQuestionData) {
      // Always update the message
      if (nextQuestionData.message) {
        setCurrentMessage(nextQuestionData.message);
      }

      // Only update question/answers if we're not currently in the middle of an answer flow
      // OR if this is the first time we're getting data
      if (
        !isAnswerSubmitted ||
        (!currentQuestion && nextQuestionData.question)
      ) {
        if (nextQuestionData.question) {
          setCurrentQuestion(nextQuestionData.question);
        }
        if (nextQuestionData.questionRephrased) {
          setCurrentQuestionRephrased(nextQuestionData.questionRephrased);
        }
        if (nextQuestionData.answers) {
          setCurrentAnswers(nextQuestionData.answers);
        }
        if (nextQuestionData.correctAnswer) {
          setCurrentCorrectAnswer(nextQuestionData.correctAnswer);
        }
        if (nextQuestionData.hint) {
          setCurrentHint(nextQuestionData.hint);
        }
      }
    }
  }, [nextQuestionData, isAnswerSubmitted, currentQuestion]);

  // Reset answer states when course changes
  useEffect(() => {
    setSelectedAnswer(null);
    setIsAnswerSubmitted(false);
    setIsAnswerCorrect(false);
    setShowHint(false);
    setCurrentQuestion("");
    setCurrentQuestionRephrased("");
    setCurrentAnswers([]);
    setCurrentCorrectAnswer("");
    setCurrentHint("");
    setCurrentMessage("");
  }, [selectedCourse]);

  const handleCourseSelect = async (course) => {
    setSelectedCourse(course);

    // Update the last opened timestamp
    if (user?.id) {
      try {
        await updateLastOpened({
          courseId: course._id,
          userId: user.id,
        });
      } catch (error) {
        console.error("Failed to update last opened:", error);
      }
    }
  };

  const handleCreateCourse = async () => {
    if (!user?.id) {
      console.error("User not authenticated");
      return;
    }

    try {
      const courseId = await createCourse({
        createdBy: user.id,
      });

      // The course will be automatically selected when the courses query updates
      console.log("Course created:", courseId);
    } catch (error) {
      console.error("Failed to create course:", error);
    }
  };

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

    // Show immediate feedback based on current local state
    const correct = currentCorrectAnswer === answerText;
    setIsAnswerCorrect(correct);
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
      setIsAnswerCorrect(false);
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const handleNextQuestion = async () => {
    // Console log the current question and answers before moving to next
    console.log(
      "Current Question:",
      currentQuestionRephrased || currentQuestion,
    );
    console.log("Current Answers:", currentAnswers);
    console.log("Correct Answer:", currentCorrectAnswer);

    setIsLoadingNextQuestion(true);

    // Reset answer states
    setSelectedAnswer(null);
    setIsAnswerSubmitted(false);
    setIsAnswerCorrect(false);
    setShowHint(false);

    // Update local state with the latest nextQuestionData (which should have the new question)
    if (nextQuestionData) {
      if (nextQuestionData.question) {
        setCurrentQuestion(nextQuestionData.question);
      }
      if (nextQuestionData.questionRephrased) {
        setCurrentQuestionRephrased(nextQuestionData.questionRephrased);
      }
      if (nextQuestionData.answers) {
        setCurrentAnswers(nextQuestionData.answers);
      }
      if (nextQuestionData.correctAnswer) {
        setCurrentCorrectAnswer(nextQuestionData.correctAnswer);
      }
      if (nextQuestionData.hint) {
        setCurrentHint(nextQuestionData.hint);
      }
    }

    setIsLoadingNextQuestion(false);
  };

  const handleUploadComplete = () => {
    // Files will automatically refresh due to Convex reactivity
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

  // Helper function to get button style based on answer state
  const getAnswerButtonStyle = (answerIndex, baseColor) => {
    if (!isAnswerSubmitted) {
      // Normal state - show hover effects
      return `${baseColor} hover:opacity-80 transition-opacity`;
    }

    // Answer submitted - show correct/incorrect states
    const isCorrectAnswer =
      currentCorrectAnswer === currentAnswers[answerIndex];
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
      {/* Yellow strip background with diagonal lines */}
      <div
        className="absolute inset-0 bg-yellow-400"
        style={{
          backgroundImage: `repeating-linear-gradient(
            45deg,
            transparent,
            transparent 10px,
            rgba(255, 255, 255, 0.1) 10px,
            rgba(255, 255, 255, 0.1) 20px
          )`,
        }}
      ></div>

      <div className="z-10 relative flex flex-col h-full w-full font-bold gap-4">
        <div className="pt-[5px] bg-blue-500 border-blue-400 border-b-2 rounded-b-[48px] h-16 flex flex-row items-center text-2xl font-bold translate-y-[-5px] hover:translate-y-[0px] transition-all duration-200">
          <div className="h-full w-full flex flex-row items-center justify-between px-8">
            <div className="flex flex-row items-center gap-8">
              <Book className="h-6 w-6 text-white" />
              <DropdownMenu>
                <DropdownMenuTrigger className="bg-white px-4 w-[180px] py-1 rounded-full flex items-center gap-2 hover:bg-gray-50 transition-colors justify-center">
                  My Courses
                  <ChevronDownIcon className="h-4 w-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="p-2"
                  //   style={{ width: "580px" }}
                >
                  <div className="grid grid-cols-3 gap-2">
                    {/* Create New Course button - always first */}
                    <DropdownMenuItem
                      className="cursor-pointer p-2 rounded-lg border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                      style={{ width: "180px", height: "80px" }}
                      onClick={handleCreateCourse}
                    >
                      <div className="flex items-center justify-center w-full h-full gap-1">
                        <PlusIcon className="h-4 w-4" />
                        <span className="text-sm font-[Menco]">Create New</span>
                      </div>
                    </DropdownMenuItem>

                    {/* Course items */}
                    {courses &&
                      courses.length > 0 &&
                      courses.map((course) => (
                        <DropdownMenuItem
                          key={course._id}
                          className="cursor-pointer p-2 rounded-lg border hover:bg-gray-50 transition-colors"
                          style={{ width: "180px", height: "80px" }}
                          onClick={() => handleCourseSelect(course)}
                        >
                          <div className="grid gap-1 w-full h-full">
                            <span className="font-medium text-xs truncate">
                              {course.name}
                            </span>
                            <span className="text-xs text-gray-500">
                              {new Date(course.createdAt).toLocaleDateString()}
                            </span>
                            {course.lastOpenedAt && (
                              <span className="text-xs text-blue-600">
                                Last:{" "}
                                {new Date(
                                  course.lastOpenedAt,
                                ).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </DropdownMenuItem>
                      ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex flex-row rounded-full border-2 border-white">
              <UserButton />
            </div>
          </div>
        </div>
        <div className="flex flex-row h-full gap-4 mx-4 mb-4">
          <div className="basis-[38.2%] bg-orange-300 h-full rounded-l-[12px] rounded-r-[48px] p-8 text-xl">
            {/* If no courses, show a message to create a course */}
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
                {selectedFiles && selectedFiles.length > 0 && (
                  <div className="text-sm bg-white bg-opacity-20 rounded px-2 py-1 mt-2">
                    <span className="font-medium">
                      Selected Files ({selectedFiles.length}):
                    </span>{" "}
                    {selectedFiles.map((file, index) => (
                      <span key={file._id}>
                        {file.name}
                        {index < selectedFiles.length - 1 && ", "}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedCourse && (
              <div className="flex flex-col h-full">
                {/* File Upload Section */}
                <div className="flex-1 min-h-0">
                  <div className="mb-4">
                    <UploadDropZone
                      courseId={selectedCourse._id}
                      onUploadComplete={handleUploadComplete}
                    />
                  </div>

                  {/* File Viewing Section */}
                  <div className="flex-1 min-h-0">
                    <div className="h-64 overflow-y-auto">
                      <UploadedFiles courseId={selectedCourse._id} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="basis-[61.8%] relative flex items-center justify-center">
            {/* Loading overlay during course preparation */}
            {isStartingCourse && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-20 rounded-l-[48px] rounded-r-[12px]">
                <Spinner size="xl" className="text-white mb-4" />
                <div className="text-white text-xl font-bold">Preparing...</div>
              </div>
            )}

            {/* Ready to start overlay */}
            {!courseStarted && !isStartingCourse && (
              <div className="absolute self-center z-10 flex flex-col gap-1 rounded-lg px-8 py-4">
                <div className="text-center drop-shadow-2xl">
                  {!hasFiles
                    ? "Upload some files to get started"
                    : !allFilesHaveMetadata
                      ? "Processing files..."
                      : "Ready to start?"}
                </div>
                <Button
                  variant="outline"
                  className="bg-white text-black"
                  disabled={!isReadyToStart}
                  onClick={handleStartCourse}
                >
                  {!hasFiles
                    ? "Upload Files First"
                    : !allFilesHaveMetadata
                      ? "Please Wait..."
                      : "Let's go!"}
                </Button>
              </div>
            )}
            <div
              className={`${courseStarted ? "" : "blur-sm"} flex flex-col h-full w-full gap-4`}
            >
              <div className="basis-[40%] bg-green-500 w-full rounded-l-[48px] rounded-r-[12px] p-8 text-xl">
                <div className="w-full h-full flex flex-col items-center justify-between">
                  <div className="text-sm">Flash Cards</div>

                  {/* Flashcard Content */}
                  <div className="text-center flex-1 flex items-center justify-center px-4">
                    {currentFlashcard ? (
                      <div className="space-y-1 flex flex-col items-center justify-center">
                        <div className="text-lg font-bold text-white">
                          {currentFlashcard.conceptTitle}
                        </div>
                        <div className="text-base bg-white bg-opacity-20 rounded-lg px-4 py-2 max-w-[80%]">
                          {currentFlashcard.flashCardText}
                        </div>
                        {/* <div className="text-xs text-green-100">
                          {currentFlashcard.relatedArea}
                        </div> */}
                      </div>
                    ) : flashcards.length === 0 ? (
                      <div className="text-center">
                        <div className="text-base">No flashcards yet</div>
                        <div className="text-sm text-green-100">
                          Start learning to generate flashcards!
                        </div>
                      </div>
                    ) : (
                      "Loading flashcards..."
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
                      <span className="text-sm text-green-100">
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
              <div className="basis-[60%] bg-purple-500 border-purple-400 w-full rounded-l-[48px] rounded-r-[12px] p-8 text-xl">
                <div className="flex flex-col h-full gap-4">
                  <div className="flex flex-row gap-4">
                    <div className="h-16 min-w-16 aspect-square bg-black self-end">
                      <img
                        src="/Tutors/steve.png"
                        className="h-full w-full object-cover"
                        alt=""
                      />
                    </div>
                    <div className="bg-white rounded-t-[24px] rounded-br-[24px] p-4 relative">
                      {currentMessage || "Getting ready to teach you..."}
                    </div>
                  </div>
                  <div className="flex flex-col h-full justify-between">
                    <div className="h-full flex items-center justify-center text-white text-2xl text-center">
                      {currentQuestionRephrased ||
                        currentQuestion ||
                        "Loading question..."}
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

                      {/* Hint Button - shows when answer not submitted and hint exists */}
                      {!isAnswerSubmitted && currentHint && !showHint && (
                        <div className="mb-2 flex justify-center">
                          <Button
                            onClick={() => setShowHint(true)}
                            className="bg-white text-purple-600 hover:bg-gray-100 font-bold flex items-center gap-2"
                          >
                            <Lightbulb className="h-5 w-5 text-yellow-500" />
                            Show Hint
                          </Button>
                        </div>
                      )}

                      {/* Hint Display - shows when hint button is clicked */}
                      {showHint && currentHint && (
                        <div className="mb-2 flex justify-center">
                          <div className="text-white text-center text-sm">
                            💡{currentHint}
                          </div>
                        </div>
                      )}

                      {currentAnswers?.length === 4 ? (
                        currentAnswers.map((answer, index) => {
                          const icons = [Triangle, Diamond, Circle, Square];
                          const colors = [
                            "bg-red-500",
                            "bg-blue-500",
                            "bg-yellow-500",
                            "bg-green-600",
                          ];
                          const Icon = icons[index];
                          const isCorrectAnswer =
                            currentCorrectAnswer === answer;
                          const isSelectedAnswer = selectedAnswer === index;

                          return (
                            <button
                              key={index}
                              onClick={() => handleAnswerClick(index, answer)}
                              disabled={isAnswerSubmitted || isSubmittingAnswer}
                              className={`${getAnswerButtonStyle(index, colors[index])} rounded-2xl p-4 flex flex-row gap-2 text-white text-lg items-center justify-between cursor-pointer disabled:cursor-not-allowed`}
                            >
                              <div className="flex flex-row gap-2 items-center">
                                <Icon />
                                <span>{answer}</span>
                              </div>

                              {/* Show correct/incorrect icons after submission */}
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
    </div>
  );
}

"use client";
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
  useQuery,
  useMutation,
  useAction,
} from "convex/react";
import { SignIn, SignInButton, UserButton, useUser } from "@clerk/clerk-react";
import { api } from "../../convex/_generated/api";
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

export default function Page() {
  const { user } = useUser();
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [isStartingCourse, setIsStartingCourse] = useState(false);

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
  const [displayedMessage, setDisplayedMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);

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

  const updateCourseName = useMutation(api.courses.updateCourseName);
  const startCourse = useAction(api.courses.startCourse);
  const answerQuestion = useAction(api.llm.tutorAgent.agent.answerQuestion);

  // Check if all files have metadata generated
  const allFilesHaveMetadata =
    files && files.length > 0 && files.every((file) => file.metadata);
  const hasFiles = files && files.length > 0;
  const isReadyToStart = hasFiles && allFilesHaveMetadata;
  const courseStarted = learningData?.nextQuestion && learningData?.flashcards;
  console.log(learningData?.nextQuestion);
  console.log(learningData?.flashcards);

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
    setDisplayedMessage("");
    setIsTyping(false);
  }, [selectedCourse]);

  // Typing animation effect for currentMessage
  useEffect(() => {
    if (!currentMessage) {
      setDisplayedMessage("");
      setIsTyping(false);
      return;
    }

    // Start typing animation
    setIsTyping(true);
    setDisplayedMessage("");

    let currentIndex = 0;
    const typingInterval = setInterval(() => {
      if (currentIndex < currentMessage.length) {
        setDisplayedMessage(currentMessage.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        setIsTyping(false);
        clearInterval(typingInterval);
      }
    }, 30); // Adjust speed by changing this value (lower = faster)

    return () => clearInterval(typingInterval);
  }, [currentMessage]);

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
      <StripBackground />

      <Authenticated>
        <div className="z-10 relative flex flex-col h-full w-full font-bold gap-4">
          <Navbar
            courses={courses}
            selectedCourse={selectedCourse}
            setSelectedCourse={setSelectedCourse}
          />
          <div className="flex flex-row h-full gap-4 mx-4 mb-4">
            <div className="w-[38.2%] bg-orange-300 h-full rounded-l-[12px] rounded-r-[48px] p-8 text-xl">
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
                        <DropdownMenuTrigger className="h-full flex items-center">
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
                  {/* {selectedFiles && selectedFiles.length > 0 && (
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
                  )} */}
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
                      <div className="h-16 min-w-16 aspect-square bg-black self-end">
                        <img
                          src="/Tutors/steve.png"
                          className="h-full w-full object-cover"
                          alt=""
                        />
                      </div>
                      {currentMessage && (
                        <div className="bg-white rounded-t-[24px] rounded-br-[24px] px-4 py-3 leading-6 relative">
                          {displayedMessage}
                        </div>
                      )}
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
                                disabled={
                                  isAnswerSubmitted || isSubmittingAnswer
                                }
                                className={`${getAnswerButtonStyle(index, colors[index])} rounded-2xl p-4 text-white text-lg  cursor-pointer disabled:cursor-not-allowed flex flex-row gap-2 items-center justify-between`}
                              >
                                <div className="flex flex-row gap-2 items-center">
                                  <Icon className="min-h-6 min-w-6" />
                                  <div className="text-left leading-5">
                                    {answer}
                                  </div>
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

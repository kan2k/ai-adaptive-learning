"use client";
import useSWR from "swr";
import { fetcher, apiFetch } from "@/lib/api";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreVertical,
  Share2,
  RefreshCcw,
  Trash,
  Layers,
  FileQuestion,
  Container,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import UploadDropZone from "@/components/UploadDropZone";
import UploadedFiles from "@/components/UploadedFiles";
import { StripBackground } from "@/components/StripBackground";
import { Navbar } from "@/components/Navbar";
import { Flashcard } from "@/components/Flashcard";
import Image from "next/image";
import { Preferences } from "@/components/Preferences";
import { Quiz } from "@/components/Quiz";
import { KnowledgeGraph } from "@/components/KnowledgeGraph";
import { Chat } from "@/components/Chat";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

const localUser = { id: "local" };

export default function Page() {
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [isStartingCourse, setIsStartingCourse] = useState(false);
  const creatingInitialCourseRef = useRef(false);

  const nameInputRef = useRef(null);

  const { data: courses, mutate: mutateCourses } = useSWR("/api/courses", fetcher, {
    refreshInterval: 5000,
  });

  const { data: preferencesData } = useSWR("/api/preferences", fetcher);
  const preferences =
    preferencesData === undefined ? undefined : preferencesData.preferences;

  const { data: files } = useSWR(
    selectedCourse?._id ? `/api/courses/${selectedCourse._id}/files` : null,
    fetcher,
    { refreshInterval: 3000 },
  );

  const { data: learningData, mutate: mutateLearningData } = useSWR(
    selectedCourse?._id
      ? `/api/courses/${selectedCourse._id}/learning-data`
      : null,
    fetcher,
    { refreshInterval: 3000 },
  );

  // Extract individual data from learningData
  const nextQuestionData = learningData?.nextQuestion || null;
  const flashcards = learningData?.flashcards || [];
  const knowledgeGraph = learningData?.knowledgeGraph || null;
  const courseReady =
    knowledgeGraph &&
    flashcards &&
    flashcards.length > 0 &&
    nextQuestionData &&
    learningData?.studentProgress;

  const createCourse = useCallback(async () => {
    const course = await apiFetch("/api/courses");
    await mutateCourses();
    return course;
  }, [mutateCourses]);

  const answerQuestion = useCallback(
    async ({ courseId, answer }) =>
      apiFetch(`/api/courses/${courseId}/answer`, { body: { answer } }),
    [],
  );

  useEffect(() => {
    // Fresh study folder with no indexable files yet: create a starter course
    if (courses && courses.length === 0 && !creatingInitialCourseRef.current) {
      creatingInitialCourseRef.current = true;
      const createInitialCourse = async () => {
        try {
          await createCourse();
        } catch (error) {
          console.error("Failed to create initial course:", error);
          creatingInitialCourseRef.current = false;
        }
      };
      createInitialCourse();
    }
  }, [courses, createCourse]);

  // Check if all files have metadata concepts
  const allFilesHaveConcepts =
    files &&
    files.length > 0 &&
    files.every(
      (file) => file.metadata && Object.keys(file.metadata.concepts).length > 0,
    );
  const hasFiles = files && files.length > 0;
  const isReadyToStart = hasFiles && allFilesHaveConcepts;

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

  const handleStartCourse = async () => {
    if (!selectedCourse) {
      console.error("No course selected");
      return;
    }

    setIsStartingCourse(true);
    try {
      const result = await apiFetch(
        `/api/courses/${selectedCourse._id}/start`,
      );
      console.log("Course started successfully:", result);
      await mutateLearningData();
    } catch (error) {
      console.error("Failed to start course:", error);
      alert(`Failed to start course: ${error.message}`);
      setIsStartingCourse(false);
    }
  };

  const handleStartEditing = () => {
    if (selectedCourse) {
      setEditingName(selectedCourse.name);
      setIsEditingName(true);
    }
  };

  const handleFinishEditing = async () => {
    if (!selectedCourse || !editingName.trim()) {
      setIsEditingName(false);
      return;
    }

    try {
      await apiFetch(`/api/courses/${selectedCourse._id}`, {
        method: "PATCH",
        body: { name: editingName.trim() },
      });

      // Update the selected course state immediately
      setSelectedCourse({
        ...selectedCourse,
        name: editingName.trim(),
      });
      await mutateCourses();

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

  const handleRestartCourse = async () => {
    if (!selectedCourse) {
      console.error("No course selected");
      return;
    }

    try {
      await apiFetch(`/api/courses/${selectedCourse._id}/restart`);
      console.log("Course restarted successfully");
      await mutateLearningData();
    } catch (error) {
      console.error("Failed to restart course:", error);
    }
  };

  const handleDeleteCourse = async () => {
    if (!selectedCourse) {
      console.error("No course selected");
      return;
    }

    try {
      await apiFetch(`/api/courses/${selectedCourse._id}`, {
        method: "DELETE",
      });
      console.log("Course deleted successfully");
      setSelectedCourse(null);
      await mutateCourses();
    } catch (error) {
      console.error("Failed to delete course:", error);
    }
  };

  // Focus the input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-yellow-300 font-[Menco]">
      <StripBackground />
      {preferences === undefined ? (
        <div className="flex flex-row gap-4 mx-4 mb-4 items-center justify-center h-full w-full">
          <Spinner size="xl" className="text-white mb-4" />
        </div>
      ) : preferences === null ? (
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
            createCourse={createCourse}
          />
          <Chat courseId={selectedCourse?._id} />
          <div className="flex flex-row flex-1 gap-4 mx-4 mb-4 min-h-0">
            <ResizablePanelGroup direction="horizontal">
              <ResizablePanel defaultSize={30} minSize={20}>
                <div className="w-full bg-orange-300 h-full rounded-[48px] p-8 overflow-y-auto">
                  {courses === undefined && (
                    // Loading state
                    <div className="flex justify-center items-center h-full">
                      <Spinner size="lg" />
                    </div>
                  )}

                  {courses && courses.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center">
                      <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                        <Spinner size="lg" />
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
                              {/* <DropdownMenuItem>
                                  <Share2 className="h-5 w-5" />
                                  Share
                                </DropdownMenuItem> */}
                              <DropdownMenuItem onClick={handleRestartCourse}>
                                <RefreshCcw /> Restart
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={handleDeleteCourse}>
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
                                        learningData?.studentProgress[
                                          conceptName
                                        ].mastery
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
              </ResizablePanel>
              <ResizableHandle withHandle={false} />
              <ResizablePanel defaultSize={70} minSize={50}>
                <div className="w-full h-full relative flex items-center justify-center">
                  {/* Loading overlay during course preparation */}
                  {isStartingCourse && !courseReady && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                      <Spinner size="xl" className="text-white mb-4" />
                      <div className="text-white text-xl font-bold text-shadow-black">
                        Preparing...
                      </div>
                    </div>
                  )}

                  {/* Ready to start overlay */}
                  {!isStartingCourse && !courseReady && (
                    <div className="absolute self-center z-10 flex flex-col items-center justify-center gap-1 rounded-lg px-8 py-4">
                      <div className="text-center text-xl">
                        {!hasFiles
                          ? "Add notes to get started"
                          : !allFilesHaveConcepts
                            ? "Processing files..."
                            : "Ready to begin?"}
                      </div>
                      <div className="">
                        <Button
                          variant="outline"
                          className="bg-white text-black font-[Menco] font-bold"
                          disabled={!isReadyToStart}
                          onClick={handleStartCourse}
                        >
                          Begin Course
                        </Button>
                      </div>
                    </div>
                  )}
                  <div
                    className={`h-full w-full ${
                      !courseReady ? "blur-sm pointer-events-none" : ""
                    }`}
                  >
                    <Tabs
                      defaultValue="knowledgeGraph"
                      className="flex flex-col h-full w-full gap-4"
                    >
                      <TabsList className="flex flex-row gap-4">
                        <div className="flex flex-row items-center w-fit rounded-[24px] overflow-hidden">
                          <TabsTrigger
                            value="knowledgeGraph"
                            className="bg-emerald-600 px-4 py-3 flex flex-row items-center justify-between gap-2 cursor-pointer group"
                          >
                            <div className="flex flex-row gap-2 h-full w-full">
                              <Container className="h-full w-auto scale-90 group-hover:scale-100 transition-all duration-300" />
                              <div className="flex flex-col mt-1">
                                <div className="flex items-center">
                                  <p className="font-bold text-base">
                                    Knowledge Graph
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-row gap-2 items-center">
                              {learningData?.knowledgeGraph ? (
                                <div className="text-xs mt-0.5 bg-black/20 text-black rounded-full whitespace-nowrap px-3 py-0.5">
                                  0%
                                </div>
                              ) : (
                                <Spinner size="sm" />
                              )}
                            </div>
                          </TabsTrigger>
                          <TabsTrigger
                            value="flashcards"
                            className="bg-emerald-600 px-4 py-3 flex flex-row items-center justify-between gap-2 cursor-pointer group"
                          >
                            <div className="flex flex-row gap-2 h-full w-full">
                              <Layers className="h-full w-auto scale-90 group-hover:scale-100 transition-all duration-300" />
                              <div className="flex flex-col mt-1">
                                <div className="flex items-center">
                                  <p className="font-bold text-base">
                                    Flashcards
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-row gap-2 items-center">
                              {learningData?.flashcards ? (
                                <div className="text-xs mt-0.5 bg-black/20 text-black rounded-full whitespace-nowrap px-3 py-0.5">
                                  0%
                                </div>
                              ) : (
                                <Spinner size="sm" />
                              )}
                            </div>
                          </TabsTrigger>
                          <TabsTrigger
                            className="bg-purple-400 px-4 py-3 flex flex-row items-center justify-between gap-2 cursor-pointer group"
                            value="quiz"
                          >
                            <div className="flex flex-row gap-2 h-full w-full">
                              <FileQuestion className="h-full w-auto scale-90 group-hover:scale-100 transition-all duration-300" />
                              <div className="flex flex-col mt-1">
                                <div className="flex items-center">
                                  <p className="font-bold text-base">Quiz</p>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-row gap-1 items-center">
                              {learningData?.nextQuestion ? (
                                <div className="text-xs mt-0.5 bg-black/20 rounded-full whitespace-nowrap px-3 py-0.5">
                                  0%
                                </div>
                              ) : (
                                <Spinner size="sm" />
                              )}
                            </div>
                          </TabsTrigger>
                        </div>
                      </TabsList>
                      <div className="flex-1 min-h-0 overflow-hidden">
                        <TabsContent
                          value="knowledgeGraph"
                          className="h-full overflow-hidden"
                        >
                          <KnowledgeGraph knowledgeGraph={knowledgeGraph} />
                        </TabsContent>
                        <TabsContent
                          value="flashcards"
                          className="h-full overflow-hidden"
                        >
                          <Flashcard
                            flashcards={flashcards}
                            courseId={selectedCourse?._id}
                          />
                        </TabsContent>
                        <TabsContent
                          value="quiz"
                          className="h-full overflow-hidden"
                        >
                          <Quiz
                            courseId={selectedCourse?._id}
                            nextQuestionData={nextQuestionData}
                            answerQuestion={answerQuestion}
                            user={localUser}
                          />
                        </TabsContent>
                      </div>
                    </Tabs>
                  </div>
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      )}
    </div>
  );
}

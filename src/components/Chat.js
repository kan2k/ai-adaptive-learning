import {
  MessageSquareMore,
  Plus,
  Trash2,
  Send,
  ArrowUp,
  MessageSquare,
  MessagesSquare,
} from "lucide-react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { X } from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import useSWR from "swr";
import { fetcher, apiFetch } from "@/lib/api";
import { Spinner } from "./ui/spinner";
import { LLMContent } from "./LLMContent";

export function Chat({ courseId }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Queries
  const { data: threads, mutate: mutateThreads } = useSWR(
    "/api/chat/threads",
    fetcher,
    { refreshInterval: 5000 },
  );
  const { data: messages, mutate: mutateMessages } = useSWR(
    currentThreadId ? `/api/chat/threads/${currentThreadId}/messages` : null,
    fetcher,
    { refreshInterval: 1500 },
  );
  const { data: courseMaterials } = useSWR(
    courseId ? `/api/courses/${courseId}` : null,
    fetcher,
  );

  const sendMessage = useCallback(
    async ({ threadId, content }) => {
      const result = await apiFetch(`/api/chat/threads/${threadId}/messages`, {
        body: { content },
      });
      await mutateMessages();
      return result;
    },
    [mutateMessages],
  );

  const handleCreateThread = useCallback(async () => {
    if (!courseId) {
      console.log("Cannot create thread: missing courseId", { courseId });
      return;
    }

    setIsLoading(true);
    try {
      const result = await apiFetch("/api/chat/threads", {
        body: { courseId },
      });
      await mutateThreads();
      setCurrentThreadId(result.threadId);
    } catch (error) {
      console.error("Error creating thread:", error);
    } finally {
      setIsLoading(false);
    }
  }, [courseId, mutateThreads]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const adjustTextareaHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [message, adjustTextareaHeight]);

  useEffect(() => {
    console.log(
      "Threads changed:",
      threads?.length,
      "Current thread:",
      currentThreadId,
    );
    // Auto-create a thread if none exists
    if (threads && threads.length === 0 && !currentThreadId && !isLoading) {
      console.log("Creating new thread...");
      handleCreateThread();
    }
    // Set first thread as current if no current thread
    else if (threads && threads.length > 0 && !currentThreadId) {
      console.log("Setting first thread as current:", threads[0].threadId);
      setCurrentThreadId(threads[0].threadId);
    }
  }, [threads, currentThreadId, isLoading, handleCreateThread]);

  const handleSendMessage = useCallback(async () => {
    if (!message.trim() || !currentThreadId || isLoading) return;

    const messageContent = message.trim();
    setMessage("");
    setIsLoading(true);

    try {
      console.log(
        "Sending message:",
        messageContent,
        "to thread:",
        currentThreadId,
      );
      const result = await sendMessage({
        threadId: currentThreadId,
        content: messageContent,
      });
      console.log("Message sent result:", result);
    } catch (error) {
      console.error("Error sending message:", error);
      alert(error.message);
      // Reset message if there was an error
      setMessage(messageContent);
    } finally {
      setIsLoading(false);
    }
  }, [message, currentThreadId, isLoading, sendMessage]);

  const handleDeleteThread = useCallback(
    async (threadId) => {
      try {
        await apiFetch(`/api/chat/threads/${threadId}`, { method: "DELETE" });
        await mutateThreads();
        if (currentThreadId === threadId) {
          setCurrentThreadId(null);
        }
      } catch (error) {
        console.error("Error deleting thread:", error);
      }
    },
    [currentThreadId, mutateThreads],
  );

  const handleKeyPress = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getThreadTitle = (thread) => {
    if (thread.title) return thread.title;
    return `Chat ${new Date(thread.createdAt).toLocaleDateString()}`;
  };

  // Generate suggestion prompts from course materials
  const suggestions = useMemo(() => {
    if (!courseMaterials?.files || courseMaterials.files.length === 0) {
      return [];
    }

    const allConcepts = [];
    courseMaterials.files.forEach((file) => {
      if (file.metadata?.concepts) {
        Object.values(file.metadata.concepts).forEach((concept) => {
          allConcepts.push(concept);
        });
      }
    });

    if (allConcepts.length === 0) {
      return [];
    }

    // Take first 2 concepts (or less if fewer available)
    const selectedConcepts = allConcepts.slice(0, 2);

    const suggestionTypes = [
      "Explain",
      "Tell me about",
      "What is",
      "Can you help me understand",
    ];

    return selectedConcepts.map((concept) => {
      const suggestionType =
        suggestionTypes[Math.floor(Math.random() * suggestionTypes.length)];
      return {
        text: `${suggestionType} ${concept.title.toLowerCase()}`,
        concept: concept.title,
      };
    });
  }, [courseMaterials?.files]);

  const handleSuggestionClick = useCallback(
    async (suggestion) => {
      if (!currentThreadId || isLoading) return;

      setIsLoading(true);
      try {
        console.log(
          "Sending suggestion:",
          suggestion.text,
          "to thread:",
          currentThreadId,
        );
        const result = await sendMessage({
          threadId: currentThreadId,
          content: suggestion.text,
        });
        console.log("Suggestion sent result:", result);
      } catch (error) {
        console.error("Error sending suggestion:", error);
        alert(error.message);
      } finally {
        setIsLoading(false);
      }
    },
    [currentThreadId, isLoading, sendMessage],
  );

  // Check if user has sent any messages (excluding the initial assistant message)
  const hasUserMessages = messages && messages.length > 1;

  // Show suggestions only if we have course materials and no user messages yet
  const shouldShowSuggestions = useMemo(() => {
    return (
      !hasUserMessages && suggestions.length > 0 && currentThreadId && courseId
    );
  }, [hasUserMessages, suggestions.length, currentThreadId, courseId]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <div className="absolute bottom-9 right-9 z-[50] bg-gray-100 p-3 flex flex-row items-center justify-between gap-2 rounded-[24px] cursor-pointer group hover:scale-105 transition-all duration-300 shadow-lg group">
          <div className="flex flex-row h-full w-full items-center">
            <MessagesSquare className="h-full aspect-square" />
            <p className="font-bold text-lg whitespace-nowrap group-hover:w-auto group-hover:ml-2 w-0 overflow-hidden transition-all duration-500">
              Ask something...
            </p>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="w-full min-w-[820px] h-[800px] flex flex-col font-[Menco] gap-0">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex flex-row gap-2 justify-between items-center">
            <div className="flex items-center gap-2 flex-wrap pr-8">
              <button
                onClick={handleCreateThread}
                disabled={isLoading || !courseId}
                className={`px-3 py-1 flex flex-row items-center gap-1 rounded-lg border cursor-pointer text-black bg-white ${
                  !courseId ? "opacity-50 cursor-not-allowed" : ""
                }`}
                title={
                  !courseId ? "Please select a course first" : "Create new chat"
                }
              >
                <Plus className="h-4 w-4" />
                <div className="text-base font-bold mt-0.5">New Chat</div>
              </button>
              {threads?.map((thread) => (
                <div
                  key={thread.threadId}
                  className={`flex items-center gap-2 px-3 py-1 rounded-lg border cursor-pointer flex-shrink-0 ${
                    currentThreadId === thread.threadId
                      ? "bg-blue-400 border-blue-400 text-white"
                      : "bg-gray-50 border-gray-200 hover:bg-gray-100 text-black"
                  }`}
                >
                  <button
                    onClick={() => setCurrentThreadId(thread.threadId)}
                    className="text-base font-bold cursor-pointer"
                  >
                    {getThreadTitle(thread)}
                  </button>
                  <button
                    onClick={() => handleDeleteThread(thread.threadId)}
                    className={`${
                      currentThreadId === thread.threadId
                        ? "text-white"
                        : "text-black"
                    } cursor-pointer hover:text-red-500`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <DialogClose asChild>
              <X
                className="size-6 absolute top-8 right-8 hover:cursor-pointer hover:scale-105"
                onClick={() => {}}
              />
            </DialogClose>
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <div className="w-full bg-gradient-to-b from-blue-500 to-transparent h-[32px] absolute" />
        </div>
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto space-y-4 pt-4">
          {messages?.map((msg) => {
            return (
              <div
                key={msg._id}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role !== "user" && (
                  <div className="w-12 h-12 self-end overflow-hidden mr-2 flex-shrink-0">
                    <Image
                      src="/Tutors/steve.png"
                      className="h-full w-full object-cover"
                      alt=""
                      width={68}
                      height={68}
                    />
                  </div>
                )}
                <div
                  className={`max-w-[70%] px-4 py-2 ${
                    msg.role === "user"
                      ? "bg-gray-100 text-gray-900 rounded-t-lg rounded-bl-lg"
                      : "bg-gray-100 text-gray-900 rounded-t-lg rounded-br-lg"
                  }`}
                >
                  <LLMContent content={msg.content} />
                  <div
                    className={`text-xs font-bold leading-4 ${
                      msg.role === "user"
                        ? "text-gray-500 text-end"
                        : "text-gray-500"
                    }`}
                  >
                    {formatTime(msg.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions */}
        {shouldShowSuggestions && (
          <div className="flex flex-col items-center justify-center">
            <div className="flex flex-row items-center justify-center gap-2 flex-wrap pb-4">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="bg-white px-4 py-2 rounded-full text-sm font-bold cursor-pointer"
                >
                  {suggestion.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message Input */}
        <div className="flex flex-col">
          <div className="flex flex-row gap-2 rounded-[12px] bg-white p-4 mb-1">
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
              </div>
            ) : (
              <>
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                  }}
                  onKeyDown={handleKeyPress}
                  placeholder={"Type your message..."}
                  disabled={isLoading || !currentThreadId}
                  className="flex-1 font-bold text-lg focus:outline-none resize-none overflow-hidden min-h-[24px] max-h-[120px] overflow-y-auto"
                  rows={1}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!message.trim() || isLoading || !currentThreadId}
                  className="cursor-pointer text-black bg-blue-500 h-7 w-7 hover:bg-blue-400 rounded-full aspect-square flex items-center justify-center"
                >
                  <ArrowUp className="h-4 w-4 text-white" />
                </button>
              </>
            )}
          </div>
          <div className="font-bold text-xs pr-1 leading-4 self-end text-white absolute bottom-1 flex flex-row gap-0.5 whitespace-nowrap">
            <div className="bg-black/20 px-2 rounded-full">shift + return</div>
            <div className="">for new line</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { z } from "zod";
import { createTool } from "@convex-dev/agent";
import { api } from "../../_generated/api";

export const getFlashcards = createTool({
  description: "get all the flashcards",
  args: z.object({
    courseId: z.string().describe("The ID of the current course"),
  }),
  handler: async (ctx, { courseId }) => {
    const flashcards = await ctx.runQuery(
      api.flashcards.getFlashcardsByCourse,
      { courseId },
    );
    return flashcards;
  },
});

export const addFlashcards = createTool({
  description:
    "Add multiple flashcards at once for multiple concepts. Use this when starting a lesson or when multiple concepts need flashcards.",
  args: z.object({
    courseId: z.string().describe("The ID of the current course"),
    flashcards: z
      .array(
        z.object({
          conceptTitle: z
            .string()
            .describe("The concept this flashcard covers"),
          flashcardContent: z.string().describe("The content of the flashcard"),
          flashcardImageDescription: z
            .string()
            .describe("The description of the flashcard image"),
        }),
      )
      .describe("Array of flashcards to create"),
  }),
  handler: async (ctx, { courseId, flashcards }) => {
    const results = [];
    for (const flashcard of flashcards) {
      const result = await ctx.runMutation(api.flashcards.addFlashcard, {
        courseId,
        conceptTitle: flashcard.conceptTitle,
        relatedArea: flashcard.conceptTitle,
        suggestionImage: flashcard.flashcardImageDescription,
        flashCardText: flashcard.flashcardContent,
        generationType: "pre-generated",
      });
      results.push({
        conceptTitle: flashcard.conceptTitle,
        status: "added",
        content: flashcard.flashcardContent,
        createdAt: result.flashcard.createdAt,
      });
    }
    return {
      success: true,
      flashcardsAdded: results.length,
      flashcards: results,
    };
  },
});

export const setStudentProgress = createTool({
  description:
    "Set or update the student's learning progress report as a comprehensive string. Use this to create an initial progress template when starting a lesson, or to update progress after each student response.",
  args: z.object({
    courseId: z.string().describe("The ID of the current course"),
    progressReport: z
      .string()
      .describe(
        "A comprehensive progress report string containing all student learning data, performance patterns, concept mastery levels, mistake tracking, and recommendations",
      ),
  }),
  handler: async (ctx, { courseId, progressReport }) => {
    return await ctx.runMutation(api.courses.setStudentProgress, {
      courseId,
      progressReport,
    });
  },
});

export const getStudentProgress = createTool({
  description:
    "Get the student's current progress report as a comprehensive string containing all learning data, performance patterns, and tracking information",
  args: z.object({
    courseId: z.string().describe("The ID of the current course"),
  }),
  handler: async (ctx, { courseId }) => {
    return await ctx.runQuery(api.courses.getStudentProgress, {
      courseId,
    });
  },
});

export const setNextQuestion = createTool({
  description: "Set the next question for the student in the course database",
  args: z.object({
    courseId: z.string().describe("The ID of the current course"),
    question: z.string().describe("The main question to ask"),
    questionRephrased: z
      .string()
      .describe("A rephrased version of the question"),
    answers: z
      .array(z.string())
      .length(4)
      .describe("Array of 4 answer options"),
    correctAnswer: z.string().describe("The correct answer from the options"),
    hint: z.string().describe("A hint for the question"),
    concept: z.string().describe("The concept this question tests"),
    difficulty: z
      .enum(["easy", "hard"])
      .describe("The difficulty level of the question"),
    message: z.string().describe("Tutor's message or feedback to the student"),
  }),
  handler: async (
    ctx,
    {
      courseId,
      question,
      questionRephrased,
      answers,
      correctAnswer,
      hint,
      concept,
      difficulty,
      message,
    },
  ) => {
    await ctx.runMutation(api.courses.setNextQuestion, {
      courseId,
      question,
      questionRephrased,
      answers,
      correctAnswer,
      hint,
      concept,
      difficulty,
      message,
    });

    return {
      success: true,
      question,
      concept,
      difficulty,
      message: "Next question has been set successfully",
    };
  },
});

export const tutorAgentTools = {
  getFlashcards,
  addFlashcards,
  getStudentProgress,
  setStudentProgress,
  setNextQuestion,
};

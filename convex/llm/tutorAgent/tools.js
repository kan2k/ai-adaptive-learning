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
    const flashcardsToAdd = flashcards.map((flashcard) => ({
      conceptTitle: flashcard.conceptTitle,
      relatedArea: flashcard.conceptTitle,
      suggestionImage: flashcard.flashcardImageDescription,
      flashCardText: flashcard.flashcardContent,
      generationType: "pre-generated",
    }));

    await ctx.runMutation(api.flashcards.addFlashcards, {
      courseId,
      flashcards: flashcardsToAdd,
    });

    for (const flashcard of flashcards) {
      results.push({
        conceptTitle: flashcard.conceptTitle,
        status: "added",
        content: flashcard.flashcardContent,
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
    "Update the student's learning progress for a specific concept. This tracks mastery level, mistakes, difficulty progression, performance metrics, and long-term observations.",
  args: z.object({
    courseId: z.string().describe("The ID of the current course"),
    conceptKey: z
      .string()
      .describe("The concept name/key to update progress for"),
    updates: z
      .object({
        mastery: z
          .enum(["beginner", "intermediate", "advanced"])
          .optional()
          .describe("The student's mastery level for this concept"),
        mistakes: z
          .number()
          .optional()
          .describe("Number of mistakes made on this concept"),
        difficulty: z
          .enum(["easy", "hard"])
          .optional()
          .describe("Current difficulty level for questions on this concept"),
        needsReview: z
          .boolean()
          .optional()
          .describe("Whether this concept needs review/spaced repetition"),
        lastMistakeAt: z
          .number()
          .optional()
          .describe("Timestamp of the last mistake on this concept"),
        questionsCorrect: z
          .number()
          .optional()
          .describe("Number of questions answered correctly"),
        questionsTotal: z
          .number()
          .optional()
          .describe("Total number of questions asked for this concept"),
        percentage: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe(
            "Your confidence/assessment (0-100) of how likely the student is to answer correctly on this concept, based on their responses and understanding patterns",
          ),
        observation: z
          .string()
          .optional()
          .describe(
            "New observation about the student's learning for this concept. This will be appended to existing observations with a timestamp, creating a long-term learning journal. Use this to note patterns, breakthroughs, struggles, or insights.",
          ),
      })
      .describe("Object containing the progress updates to apply"),
  }),
  handler: async (ctx, { courseId, conceptKey, updates }) => {
    return await ctx.runMutation(api.courses.setStudentProgress, {
      courseId,
      conceptKey,
      updates,
    });
  },
});

export const getStudentProgress = createTool({
  description:
    "Get the student's current progress report as an object with concept names as keys and progress data as values",
  args: z.object({
    courseId: z.string().describe("The ID of the current course"),
  }),
  handler: async (ctx, { courseId }) => {
    return await ctx.runQuery(api.courses.getStudentProgress, {
      courseId,
    });
  },
});

export const initializeStudentProgress = createTool({
  description:
    "Initialize student progress tracking for all concepts in the course files. This should be called when starting a new lesson.",
  args: z.object({
    courseId: z.string().describe("The ID of the current course"),
  }),
  handler: async (ctx, { courseId }) => {
    return await ctx.runMutation(api.courses.initializeStudentProgress, {
      courseId,
    });
  },
});

export const getAllConcepts = createTool({
  description:
    "Get all concept names from the course files to understand what concepts are available for tracking",
  args: z.object({
    courseId: z.string().describe("The ID of the current course"),
  }),
  handler: async (ctx, { courseId }) => {
    return await ctx.runQuery(api.courses.getAllConcepts, {
      courseId,
    });
  },
});

export const setNextQuestion = createTool({
  description: "Set the next question for the student in the course database",
  args: z.object({
    courseId: z.string().describe("The ID of the current course"),
    originalQuestion: z.object({
      question: z.string().describe("The baseline question text."),
      answers: z
        .array(z.string())
        .length(4)
        .describe("Array of 4 answer choices."),
      correctAnswer: z.string().describe("The correct answer text."),
    }),
    enhancedQuestion: z.object({
      question: z.string().describe("The preference-enhanced question text."),
      questionRephrased: z
        .string()
        .describe("A rephrased version of the enhanced question."),
      answers: z
        .array(z.string())
        .length(4)
        .describe("Array of 4 answer choices for the enhanced question."),
      correctAnswer: z
        .string()
        .describe("The correct answer for the enhanced question."),
      hint: z.string().describe("A hint for the enhanced question."),
      conceptCovered: z
        .string()
        .describe("The concept this question is about."),
      difficulty: z
        .enum(["EASY", "HARD"])
        .describe("The difficulty level of the question ('EASY' or 'HARD')"),
    }),
    message: z
      .string()
      .describe(
        "A friendly, encouraging message for the student to be displayed.",
      ),
  }),
  handler: async (
    ctx,
    { courseId, originalQuestion, enhancedQuestion, message },
  ) => {
    await ctx.runMutation(api.courses.setNextQuestion, {
      courseId,
      originalQuestion,
      enhancedQuestion,
      message,
    });

    return {
      success: true,
      question: enhancedQuestion.question,
      concept: enhancedQuestion.conceptCovered,
      difficulty: enhancedQuestion.difficulty,
      message: "Next question has been set successfully",
    };
  },
});

export const tutorAgentTools = {
  getFlashcards,
  addFlashcards,
  getStudentProgress,
  setStudentProgress,
  // initializeStudentProgress,
  getAllConcepts,
  setNextQuestion,
};

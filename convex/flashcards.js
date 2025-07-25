import { mutation, query, action } from "./_generated/server";
import { v } from "convex/values";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Add a flashcard to a course
export const addFlashcard = mutation({
  args: {
    courseId: v.id("courses"),
    conceptTitle: v.string(),
    relatedArea: v.string(),
    suggestionImage: v.string(),
    flashCardText: v.string(),
    sourceFileId: v.optional(v.id("files")),
    generationType: v.string(), // "pre-generated" or "struggle-based"
  },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");

    const newFlashcard = {
      conceptTitle: args.conceptTitle,
      relatedArea: args.relatedArea,
      suggestionImage: args.suggestionImage,
      flashCardText: args.flashCardText,
      sourceFileId: args.sourceFileId,
      createdAt: Date.now(),
      generationType: args.generationType,
    };

    const currentLearningData = course.learningData || {};
    const existingFlashcards = currentLearningData.flashcards || [];

    return await ctx.db.patch(args.courseId, {
      learningData: {
        ...currentLearningData,
        flashcards: [...existingFlashcards, newFlashcard],
      },
    });
  },
});

// Get all flashcards for a course
export const getFlashcardsByCourse = query({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, { courseId }) => {
    const course = await ctx.db.get(courseId);
    if (!course) return [];

    return course.learningData?.flashcards || [];
  },
});

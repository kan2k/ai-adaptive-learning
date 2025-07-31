import { mutation, query, action, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";
import { internal } from "./_generated/api";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export const addFlashcards = mutation({
  args: {
    courseId: v.id("courses"),
    flashcards: v.array(
      v.object({
        conceptTitle: v.string(),
        relatedArea: v.string(),
        suggestionImage: v.string(),
        flashCardText: v.string(),
        sourceFileId: v.optional(v.id("files")),
        generationType: v.string(),
      }),
    ),
  },
  handler: async (ctx, { courseId, flashcards }) => {
    const course = await ctx.db.get(courseId);
    if (!course) throw new Error("Course not found");

    const newFlashcards = flashcards.map((f) => ({
      ...f,
      createdAt: Date.now(),
    }));

    const currentLearningData = course.learningData || {};
    const existingFlashcards = currentLearningData.flashcards || [];

    await ctx.db.patch(courseId, {
      learningData: {
        ...currentLearningData,
        flashcards: [...existingFlashcards, ...newFlashcards],
      },
    });

    return { success: true, count: newFlashcards.length };
  },
});

export const replaceFlashcards = mutation({
  args: {
    courseId: v.id("courses"),
    flashcards: v.array(
      v.object({
        conceptTitle: v.string(),
        relatedArea: v.string(),
        suggestionImage: v.string(),
        flashCardText: v.string(),
        sourceFileId: v.optional(v.id("files")),
        generationType: v.string(),
      }),
    ),
  },
  handler: async (ctx, { courseId, flashcards }) => {
    const course = await ctx.db.get(courseId);
    if (!course) throw new Error("Course not found");

    const newFlashcards = flashcards.map((f) => ({
      ...f,
      createdAt: Date.now(),
    }));

    const currentLearningData = course.learningData || {};

    await ctx.db.patch(courseId, {
      learningData: {
        ...currentLearningData,
        flashcards: newFlashcards, // Replace instead of append
      },
    });

    return { success: true, count: newFlashcards.length };
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

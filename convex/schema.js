import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  courses: defineTable({
    name: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    lastOpenedAt: v.optional(v.number()),
    threadId: v.optional(v.string()),
    fileIds: v.array(v.id("files")),
    selectedFileIds: v.optional(v.array(v.id("files"))),
    learningData: v.optional(
      v.object({
        nextQuestion: v.optional(
          v.object({
            originalQuestion: v.object({
              question: v.string(),
              answers: v.array(v.string()),
              correctAnswer: v.string(),
            }),
            enhancedQuestion: v.object({
              question: v.string(),
              questionRephrased: v.string(),
              answers: v.array(v.string()),
              correctAnswer: v.string(),
              hint: v.string(),
              conceptCovered: v.string(),
              difficulty: v.string(),
            }),
            message: v.string(),
            createdAt: v.number(),
          }),
        ),
        flashcards: v.optional(
          v.array(
            v.object({
              conceptTitle: v.string(),
              relatedArea: v.string(),
              suggestionImage: v.string(), // Descriptive text for AI image generation
              flashCardText: v.string(), // Question: Answer format
              sourceFileId: v.optional(v.id("files")), // Original file this was generated from
              createdAt: v.number(),
              generationType: v.string(), // "pre-generated" or "struggle-based"
            }),
          ),
        ),
        studentProgressReport: v.optional(v.string()),
        studentProgress: v.optional(
          v.record(
            v.string(), // concept name as key
            v.object({
              mastery: v.union(
                v.literal("beginner"),
                v.literal("intermediate"),
                v.literal("advanced"),
              ),
              mistakes: v.number(),
              difficulty: v.union(v.literal("easy"), v.literal("hard")),
              needsReview: v.boolean(),
              lastMistakeAt: v.optional(v.number()),
              questionsCorrect: v.number(),
              questionsTotal: v.number(),
              percentage: v.number(), // Tutor's confidence assessment (0-100) of student's likelihood to answer correctly
              observation: v.string(), // Long-term learning journal for tracking student progress patterns
            }),
          ),
        ),
      }),
    ),
  }).index("by_user", ["createdBy"]),

  files: defineTable({
    storageId: v.optional(v.id("_storage")), // Optional for text-only files
    name: v.string(),
    type: v.string(),
    size: v.number(),
    uploadedAt: v.number(),
    textContent: v.optional(v.string()), // For extracted PDF text
    metadata: v.optional(
      v.object({
        relatedArea: v.string(),
        author: v.string(),
        description: v.string(),
        concepts: v.array(
          v.object({
            title: v.string(),
            reference: v.string(),
            summary: v.string(),
          }),
        ),
        generatedAt: v.number(),
        status: v.string(), // "success", "error", "processing"
      }),
    ),
  }),

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    profileUrl: v.optional(v.string()),
    tokenIdentifier: v.string(),
    preferences: v.optional(
      v.object({
        languageComplexity: v.union(
          v.literal("Primary"),
          v.literal("High School"),
          v.literal("University"),
        ),
        analogyUsage: v.union(
          v.literal("Frequent"),
          v.literal("Occasional"),
          v.literal("Limited"),
        ),
        wordLength: v.union(
          v.literal("Short"),
          v.literal("Medium"),
          v.literal("Long"),
        ),
      }),
    ),
  }).index("by_token", ["tokenIdentifier"]),
});

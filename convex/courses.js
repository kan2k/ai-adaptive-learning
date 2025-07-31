import { mutation, query, action } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";

export const createCourse = mutation({
  args: {
    name: v.optional(v.string()),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    // Generate a default name if none provided
    const courseName = args.name || "Untitled Course";

    const courseId = await ctx.db.insert("courses", {
      name: courseName,
      createdBy: args.createdBy,
      createdAt: Date.now(),
      lastOpenedAt: Date.now(),
      fileIds: [],
      selectedFileIds: [],
    });

    return courseId;
  },
});

export const getCourses = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const courses = await ctx.db
      .query("courses")
      .withIndex("by_user", (q) => q.eq("createdBy", args.userId))
      .order("desc")
      .collect();

    // Sort by lastOpenedAt (most recent first), then by createdAt
    return courses.sort((a, b) => {
      const aLastOpened = a.lastOpenedAt || a.createdAt;
      const bLastOpened = b.lastOpenedAt || b.createdAt;
      return bLastOpened - aLastOpened;
    });
  },
});

export const updateLastOpened = mutation({
  args: {
    courseId: v.id("courses"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the course to verify ownership
    const course = await ctx.db.get(args.courseId);

    if (!course) {
      throw new Error("Course not found");
    }

    if (course.createdBy !== args.userId) {
      throw new Error("Unauthorized: You don't own this course");
    }

    // Update the lastOpenedAt timestamp
    await ctx.db.patch(args.courseId, {
      lastOpenedAt: Date.now(),
    });

    return { success: true };
  },
});

export const updateCourseName = mutation({
  args: {
    courseId: v.id("courses"),
    name: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the course to verify ownership
    const course = await ctx.db.get(args.courseId);

    if (!course) {
      throw new Error("Course not found");
    }

    if (course.createdBy !== args.userId) {
      throw new Error("Unauthorized: You don't own this course");
    }

    // Update the course name
    await ctx.db.patch(args.courseId, {
      name: args.name,
    });

    return { success: true };
  },
});

// Helper query to get course with files
export const getCourseWithFiles = query({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      return null;
    }

    if (!course.fileIds || course.fileIds.length === 0) {
      return { ...course, files: [] };
    }

    // Get all files referenced by the course
    const files = await Promise.all(
      course.fileIds.map(async (fileId) => {
        const file = await ctx.db.get(fileId);
        return file;
      }),
    );

    return {
      ...course,
      files: files.filter(Boolean), // Filter out null files
    };
  },
});

export const removeFile = mutation({
  args: {
    courseId: v.id("courses"),
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    // Remove the file ID from the course's fileIds array
    const updatedFileIds = (course.fileIds || []).filter(
      (id) => id !== args.fileId,
    );

    // Also remove from selectedFileIds if it's there
    const updatedSelectedFileIds = (course.selectedFileIds || []).filter(
      (id) => id !== args.fileId,
    );

    await ctx.db.patch(args.courseId, {
      fileIds: updatedFileIds,
      selectedFileIds: updatedSelectedFileIds,
    });
  },
});

export const toggleFileSelection = mutation({
  args: {
    courseId: v.id("courses"),
    fileId: v.id("files"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    // Check if file exists in the course
    if (!course.fileIds?.includes(args.fileId)) {
      throw new Error("File not found in course");
    }

    const selectedFileIds = course.selectedFileIds || [];
    const isCurrentlySelected = selectedFileIds.includes(args.fileId);

    let updatedSelectedFileIds;
    if (isCurrentlySelected) {
      // Remove from selection
      updatedSelectedFileIds = selectedFileIds.filter(
        (id) => id !== args.fileId,
      );
    } else {
      // Add to selection
      updatedSelectedFileIds = [...selectedFileIds, args.fileId];
    }

    await ctx.db.patch(args.courseId, {
      selectedFileIds: updatedSelectedFileIds,
    });

    return null;
  },
});

export const getCourseThreadId = query({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    return course.threadId;
  },
});

export const getSelectedFiles = query({
  args: {
    courseId: v.id("courses"),
  },
  returns: v.array(v.id("files")),
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      return [];
    }
    return course.selectedFileIds || [];
  },
});

export const getSelectedFilesWithDetails = query({
  args: {
    courseId: v.id("courses"),
  },
  returns: v.array(
    v.object({
      _id: v.id("files"),
      _creationTime: v.number(),
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
          status: v.string(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      return [];
    }

    const selectedFileIds = course.selectedFileIds || [];
    if (selectedFileIds.length === 0) {
      return [];
    }

    // Get all selected files with their details
    const selectedFiles = await Promise.all(
      selectedFileIds.map(async (fileId) => {
        const file = await ctx.db.get(fileId);
        return file;
      }),
    );

    return selectedFiles.filter(Boolean); // Filter out null files
  },
});

export const deleteCourse = mutation({
  args: {
    courseId: v.id("courses"),
    userId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    if (course.createdBy !== args.userId) {
      throw new Error("Unauthorized: You don't own this course");
    }

    // Note: We no longer delete files from storage when deleting a course
    // Files remain in the system and can potentially be reused
    // Only delete the course document
    await ctx.db.delete(args.courseId);

    return { success: true };
  },
});

export const restartCourse = mutation({
  args: {
    courseId: v.id("courses"),
    userId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    if (course.createdBy !== args.userId) {
      throw new Error("Unauthorized: You don't own this course");
    }

    // Clear all learning data but keep the course structure and files
    await ctx.db.patch(args.courseId, {
      learningData: {},
    });

    return { success: true };
  },
});

export const updateCourseThreadInfo = mutation({
  args: {
    courseId: v.id("courses"),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    await ctx.db.patch(args.courseId, {
      threadId: args.threadId,
    });

    return { success: true };
  },
});

export const getCourse = query({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.courseId);
  },
});

export const startCourse = action({
  args: {
    courseId: v.id("courses"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the course to verify ownership
    const course = await ctx.runQuery(api.courses.getCourse, {
      courseId: args.courseId,
    });
    if (!course) {
      throw new Error("Course not found");
    }
    if (course.createdBy !== args.userId) {
      throw new Error("Unauthorized: You don't own this course");
    }

    // Call the internal startCourse action and await it
    const threadId = await ctx.runAction(
      internal.llm.tutorAgent.agent.startCourse,
      {
        courseId: args.courseId,
      },
    );

    return { success: true, threadId };
  },
});

export const setStudentProgress = mutation({
  args: {
    courseId: v.id("courses"),
    conceptKey: v.string(),
    updates: v.object({
      mastery: v.optional(
        v.union(
          v.literal("beginner"),
          v.literal("intermediate"),
          v.literal("advanced"),
        ),
      ),
      mistakes: v.optional(v.number()),
      difficulty: v.optional(v.union(v.literal("easy"), v.literal("hard"))),
      needsReview: v.optional(v.boolean()),
      lastMistakeAt: v.optional(v.number()),
      questionsCorrect: v.optional(v.number()),
      questionsTotal: v.optional(v.number()),
      percentage: v.optional(v.number()),
      observation: v.optional(v.string()),
    }),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    const currentLearningData = course.learningData || {};
    const currentProgress = currentLearningData.studentProgress || {};

    // Get existing concept data or create new one
    const existingConcept = currentProgress[args.conceptKey] || {
      mastery: "beginner",
      mistakes: 0,
      difficulty: "easy",
      needsReview: false,
      questionsCorrect: 0,
      questionsTotal: 0,
      percentage: 0,
      observation: "",
    };

    // Update the concept with new data, handling observation specially
    const updatedConcept = {
      ...existingConcept,
      ...args.updates,
    };

    // Handle observation field - append new observations rather than replacing
    if (args.updates.observation && args.updates.observation.trim() !== "") {
      const currentObservation = existingConcept.observation || "";
      const newObservation = args.updates.observation.trim();

      if (currentObservation === "") {
        updatedConcept.observation = newObservation;
      } else {
        // Append new observation with timestamp for context
        const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
        updatedConcept.observation = `${currentObservation}\n[${timestamp}] ${newObservation}`;
      }
    }

    // Use provided percentage as tutor's confidence assessment
    if (args.updates.percentage !== undefined) {
      updatedConcept.percentage = Math.max(
        0,
        Math.min(100, args.updates.percentage),
      );
    }

    // Update the progress object
    const updatedProgress = {
      ...currentProgress,
      [args.conceptKey]: updatedConcept,
    };

    await ctx.db.patch(args.courseId, {
      learningData: {
        ...currentLearningData,
        studentProgress: updatedProgress,
      },
    });

    return { success: true };
  },
});

export const getStudentProgress = query({
  args: {
    courseId: v.id("courses"),
  },
  returns: v.record(
    v.string(),
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
      percentage: v.number(),
      observation: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      return {};
    }
    return course.learningData?.studentProgress || {};
  },
});

export const initializeStudentProgress = mutation({
  args: {
    courseId: v.id("courses"),
  },
  returns: v.object({
    success: v.boolean(),
    conceptsInitialized: v.number(),
  }),
  handler: async (ctx, args) => {
    const courseWithFiles = await ctx.runQuery(api.courses.getCourseWithFiles, {
      courseId: args.courseId,
    });

    if (!courseWithFiles || !courseWithFiles.files) {
      throw new Error("Course or files not found");
    }

    const currentLearningData = courseWithFiles.learningData || {};
    const existingProgress = currentLearningData.studentProgress || {};

    // Extract all concepts from course files
    const concepts = new Set();
    for (const file of courseWithFiles.files) {
      if (file.metadata && file.metadata.concepts) {
        for (const concept of file.metadata.concepts) {
          concepts.add(concept.title);
        }
      }
    }

    // Initialize progress for each concept if it doesn't exist
    const updatedProgress = { ...existingProgress };
    let conceptsInitialized = 0;

    for (const conceptTitle of concepts) {
      if (!updatedProgress[conceptTitle]) {
        updatedProgress[conceptTitle] = {
          mastery: "beginner",
          mistakes: 0,
          difficulty: "easy",
          needsReview: false,
          questionsCorrect: 0,
          questionsTotal: 0,
          percentage: 0,
          observation: "",
        };
        conceptsInitialized++;
      }
    }

    await ctx.db.patch(args.courseId, {
      learningData: {
        ...currentLearningData,
        studentProgress: updatedProgress,
      },
    });

    return {
      success: true,
      conceptsInitialized,
    };
  },
});

export const getAllConcepts = query({
  args: {
    courseId: v.id("courses"),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const courseWithFiles = await ctx.runQuery(api.courses.getCourseWithFiles, {
      courseId: args.courseId,
    });

    if (!courseWithFiles || !courseWithFiles.files) {
      return [];
    }

    const concepts = new Set();
    for (const file of courseWithFiles.files) {
      if (file.metadata && file.metadata.concepts) {
        for (const concept of file.metadata.concepts) {
          concepts.add(concept.title);
        }
      }
    }

    return Array.from(concepts);
  },
});

export const getConceptsNeedingReview = query({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      return [];
    }

    const studentProgress = course.studentProgress || [];
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000; // 5 minutes in milliseconds

    // Return concepts that need review and haven't been asked recently
    return studentProgress.filter(
      (progress) =>
        progress.needsReview &&
        (!progress.lastMistakeAt || progress.lastMistakeAt < fiveMinutesAgo),
    );
  },
});

export const setNextQuestion = mutation({
  args: {
    courseId: v.id("courses"),
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    const nextQuestion = {
      originalQuestion: args.originalQuestion,
      enhancedQuestion: args.enhancedQuestion,
      message: args.message,
      createdAt: Date.now(),
    };

    const currentLearningData = course.learningData || {};

    await ctx.db.patch(args.courseId, {
      learningData: {
        ...currentLearningData,
        nextQuestion,
      },
    });

    return null;
  },
});

export const getLearningData = query({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      return null;
    }
    const learningData = course.learningData || {};
    const flashcards = await ctx.runQuery(
      api.flashcards.getFlashcardsByCourse,
      {
        courseId: args.courseId,
      },
    );
    return {
      nextQuestion: learningData.nextQuestion || null,
      studentProgress: learningData.studentProgress || {},
      flashcards: flashcards || [],
      knowledgeGraph: learningData.knowledgeGraph || null,
    };
  },
});

export const getNextQuestion = query({
  args: {
    courseId: v.id("courses"),
  },
  returns: v.union(
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
    v.null(),
  ),
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      return null;
    }
    return course.learningData?.nextQuestion || null;
  },
});

export const updateCourseLearningData = mutation({
  args: {
    courseId: v.id("courses"),
    learningData: v.any(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    const currentLearningData = course.learningData || {};

    await ctx.db.patch(args.courseId, {
      learningData: {
        ...currentLearningData,
        ...args.learningData,
      },
    });

    return { success: true };
  },
});

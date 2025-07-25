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
      storageId: v.id("_storage"),
      name: v.string(),
      type: v.string(),
      size: v.number(),
      uploadedAt: v.number(),
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
  },
  handler: async (ctx, args) => {
    // Note: We no longer delete files from storage when deleting a course
    // Files remain in the system and can potentially be reused
    // Only delete the course document
    await ctx.db.delete(args.courseId);
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
    progressReport: v.string(),
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
        studentProgressReport: args.progressReport,
      },
    });

    return { success: true };
  },
});

export const getStudentProgress = query({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      return "";
    }
    return course.learningData?.studentProgressReport || "";
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
    question: v.string(),
    questionRephrased: v.string(),
    answers: v.array(v.string()),
    correctAnswer: v.string(),
    hint: v.string(),
    concept: v.string(),
    difficulty: v.string(),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    const nextQuestion = {
      question: args.question,
      questionRephrased: args.questionRephrased,
      answers: args.answers,
      correctAnswer: args.correctAnswer,
      hint: args.hint,
      concept: args.concept,
      difficulty: args.difficulty,
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
    return course.learningData || null;
  },
});

export const getNextQuestion = query({
  args: {
    courseId: v.id("courses"),
  },
  returns: v.union(
    v.object({
      question: v.string(),
      questionRephrased: v.string(),
      answers: v.array(v.string()),
      correctAnswer: v.string(),
      hint: v.string(),
      concept: v.string(),
      difficulty: v.string(),
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

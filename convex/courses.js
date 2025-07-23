import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createCourse = mutation({
  args: {
    name: v.string(),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if course name already exists for this user
    const existingCourse = await ctx.db
      .query("courses")
      .withIndex("by_user", (q) => q.eq("createdBy", args.createdBy))
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();

    if (existingCourse) {
      throw new Error("Course name already exists");
    }

    const courseId = await ctx.db.insert("courses", {
      name: args.name,
      createdBy: args.createdBy,
      createdAt: Date.now(),
      fileIds: [],
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

    return courses;
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

    await ctx.db.patch(args.courseId, {
      fileIds: updatedFileIds,
    });
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

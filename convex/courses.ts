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

export const deleteCourse = mutation({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    // First delete all files associated with this course
    const files = await ctx.db
      .query("files")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    // Delete files from storage and database
    for (const file of files) {
      await ctx.storage.delete(file.storageId);
      await ctx.db.delete(file._id);
    }

    // Then delete the course
    await ctx.db.delete(args.courseId);
  },
});

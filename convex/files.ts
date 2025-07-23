import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveFile = mutation({
  args: {
    storageId: v.id("_storage"),
    name: v.string(),
    type: v.string(),
    size: v.number(),
    uploadedBy: v.string(),
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const fileId = await ctx.db.insert("files", {
      storageId: args.storageId,
      name: args.name,
      type: args.type,
      size: args.size,
      uploadedBy: args.uploadedBy,
      courseId: args.courseId,
      uploadedAt: Date.now(),
    });
    return fileId;
  },
});

export const getFiles = query({
  args: {
    userId: v.string(),
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("files")
      .withIndex("by_user_and_course", (q) =>
        q.eq("uploadedBy", args.userId).eq("courseId", args.courseId),
      )
      .order("desc")
      .collect();

    return files;
  },
});

export const getFileUrl = query({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const deleteFile = mutation({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (file) {
      await ctx.storage.delete(file.storageId);
      await ctx.db.delete(args.fileId);
    }
  },
});

import { mutation, query, action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

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
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    // Create the file record
    const fileId = await ctx.db.insert("files", {
      storageId: args.storageId,
      name: args.name,
      type: args.type,
      size: args.size,
      uploadedAt: Date.now(),
    });

    // Add the file to the course and auto-select it
    const course = await ctx.db.get(args.courseId);
    if (course) {
      await ctx.db.patch(args.courseId, {
        fileIds: [...(course.fileIds || []), fileId],
        selectedFileIds: [...(course.selectedFileIds || []), fileId],
      });
    }

    // Schedule metadata generation without awaiting it
    ctx.scheduler.runAfter(0, internal.llm.generateMetadata.generateMetadata, {
      fileId: fileId,
    });

    return fileId;
  },
});

export const saveTextFile = mutation({
  args: {
    name: v.string(),
    textContent: v.string(),
    originalSize: v.number(),
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    // Create the file record with text content
    const fileId = await ctx.db.insert("files", {
      name: args.name,
      type: "application/pdf", // Keep original type for UI purposes
      size: args.originalSize,
      textContent: args.textContent, // Store extracted text
      uploadedAt: Date.now(),
    });

    // Add the file to the course and auto-select it
    const course = await ctx.db.get(args.courseId);
    if (course) {
      await ctx.db.patch(args.courseId, {
        fileIds: [...(course.fileIds || []), fileId],
        selectedFileIds: [...(course.selectedFileIds || []), fileId],
      });
    }

    // Schedule metadata generation without awaiting it
    ctx.scheduler.runAfter(
      0,
      internal.llm.generateMetadata.generateMetadataFromText,
      {
        fileId: fileId,
      },
    );

    return fileId;
  },
});

export const saveMetadata = mutation({
  args: {
    fileId: v.id("files"),
    metadata: v.object({
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
  },
  handler: async (ctx, { fileId, metadata }) => {
    await ctx.db.patch(fileId, { metadata });
    return { success: true };
  },
});

export const getFiles = query({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course || !course.fileIds) {
      return [];
    }

    // Get all files referenced by the course
    const files = await Promise.all(
      course.fileIds.map(async (fileId) => {
        const file = await ctx.db.get(fileId);
        return file;
      }),
    );

    // Filter out any null files (in case of deleted files) and sort by upload date
    return files
      .filter((file) => Boolean(file))
      .sort((a, b) => b.uploadedAt - a.uploadedAt);
  },
});

export const getFileUrl = query({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) throw new Error("File not found");

    // For text-only files, return null (no downloadable URL)
    if (!file.storageId) {
      return null;
    }

    return await ctx.storage.getUrl(file.storageId);
  },
});

export const getFileById = query({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.fileId);
  },
});

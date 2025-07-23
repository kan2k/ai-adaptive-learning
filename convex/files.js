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

    // Add the file to the course
    const course = await ctx.db.get(args.courseId);
    if (course) {
      await ctx.db.patch(args.courseId, {
        fileIds: [...(course.fileIds || []), fileId],
      });
    }

    return fileId;
  },
});

export const generateMetadata = action({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(internal.llm.generateMetadata.generateMetadata, {
      courseId: args.courseId,
    });
  },
});

export const saveConcepts = mutation({
  args: {
    fileId: v.id("files"),
    concepts: v.array(
      v.object({
        title: v.string(),
        reference: v.string(),
        summary: v.string(),
      }),
    ),
    fileMetadata: v.object({
      relatedArea: v.string(),
      author: v.string(),
      description: v.string(),
    }),
    annotations: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.fileId, {
      metadata: {
        ...args.fileMetadata,
        concepts: args.concepts,
        generatedAt: Date.now(),
        annotations: args.annotations,
      },
    });

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

export const getFileConcepts = query({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) {
      return null;
    }

    return {
      fileName: file.name,
      concepts: file.metadata?.concepts || [],
      generatedAt: file.metadata?.generatedAt,
      hasGeneratedConcepts: Boolean(
        file.metadata?.concepts && file.metadata.concepts.length > 0,
      ),
    };
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

// Note: Files are no longer deleted, only removed from courses
// This function is kept for reference but not exported
const deleteFileFromStorage = async (ctx, fileId) => {
  const file = await ctx.db.get(fileId);
  if (file) {
    await ctx.storage.delete(file.storageId);
    await ctx.db.delete(fileId);
  }
};

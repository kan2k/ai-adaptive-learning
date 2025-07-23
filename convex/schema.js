import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  courses: defineTable({
    name: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    fileIds: v.array(v.id("files")),
  }).index("by_user", ["createdBy"]),

  files: defineTable({
    name: v.string(),
    type: v.string(),
    size: v.number(),
    storageId: v.id("_storage"),
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
        annotations: v.optional(v.any()),
      }),
    ),
  }),
});

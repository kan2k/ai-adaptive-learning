import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  courses: defineTable({
    name: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["createdBy"]),

  files: defineTable({
    name: v.string(),
    type: v.string(),
    size: v.number(),
    storageId: v.id("_storage"),
    uploadedBy: v.string(),
    courseId: v.id("courses"),
    uploadedAt: v.number(),
  })
    .index("by_user", ["uploadedBy"])
    .index("by_course", ["courseId"])
    .index("by_user_and_course", ["uploadedBy", "courseId"]),
});

"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";

export const encodePDFToBase64 = internalAction({
  args: {
    fileUrl: v.string(),
  },
  handler: async (ctx, { fileUrl }) => {
    try {
      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64PDF = buffer.toString("base64");
      return {
        success: true,
        base64PDF: `data:application/pdf;base64,${base64PDF}`,
      };
    } catch (error) {
      console.error("Error encoding PDF to base64:", error);
      return { success: false, error: error.message };
    }
  },
});

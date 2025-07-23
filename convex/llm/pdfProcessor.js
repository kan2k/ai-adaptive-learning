"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";

// Helper function to convert PDF URL to base64 using Node.js Buffer
async function encodePDFToBase64(pdfUrl) {
  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64PDF = buffer.toString("base64");

    return `data:application/pdf;base64,${base64PDF}`;
  } catch (error) {
    console.error("Error encoding PDF to base64:", error);
    throw error;
  }
}

// Note: callOpenRouterAPI is now handled in generateMetadata.js

// Main PDF processing action that runs in Node.js environment
export const processPDFFile = internalAction({
  args: {
    fileUrl: v.string(),
    fileName: v.string(),
    systemPrompt: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(`Processing PDF in Node.js environment: ${args.fileName}`);

    try {
      // Convert PDF to base64 using Node.js Buffer
      console.log(`Converting PDF to base64: ${args.fileName}`);
      const base64PDF = await encodePDFToBase64(args.fileUrl);

      // Prepare messages for OpenRouter API
      const messages = [
        {
          role: "system",
          content: args.systemPrompt,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Please analyze this PDF document and extract the key learning concepts. The file name is: ${args.fileName}. Return the response in the specified JSON format.`,
            },
            {
              type: "file",
              file: {
                filename: args.fileName,
                file_data: base64PDF,
              },
            },
          ],
        },
      ];

      // Return the messages for the main function to call the API
      return {
        success: true,
        messages: messages,
        fileName: args.fileName,
      };
    } catch (error) {
      console.error(`Error processing PDF ${args.fileName}:`, error);
      return {
        success: false,
        error: error.message,
        fileName: args.fileName,
      };
    }
  },
});

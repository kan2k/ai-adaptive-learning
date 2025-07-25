import { internalAction, query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { generateObject } from "ai";
import { openrouter } from "./providers";
import { z } from "zod";

const getSystemPrompt = () => `<role>
You are an expert educational content analyzer that extracts key learning concepts and metadata from PDF documents.
Your task is to identify file information and summarize the main concepts that students should learn from each document.
</role>

<instructions>
1. Analyze the provided PDF document thoroughly
2. First, extract file metadata:
   - Identify what subject area, field, or domain this content relates to
   - Find the author name(s) or organization (if not found, use "Unknown")
   - Write a compelling, direct description that jumps straight to what the content is about. CRITICAL: Never use meta-phrases that reference the document itself. Forbidden starts include: "This document", "This paper", "This module", "This guide", "This study", "This content", "This resource", "This material", etc. Start directly with the topic. Example: Instead of "This document provides an introduction to AI" write "Artificial Intelligence fundamentals including..."
3. Then extract multiple distinct concepts from the document (typically 3-8 concepts per document)
4. For each concept, provide:
   - A clear, concise title that captures the essence of the concept
   - A direct reference/quote from the source material that best represents this concept
   - A comprehensive summary that explains the concept in a way that helps student understanding
5. Focus on concepts that are educationally significant and would be important for students to master
6. Ensure each concept is distinct and doesn't overlap with others
7. Make sure the reference is an exact quote or paraphrase from the source material
</instructions>`;

const conceptSchema = z.object({
  fileName: z.string().describe("The name of the PDF file being analyzed"),
  fileMetadata: z
    .object({
      relatedArea: z
        .string()
        .describe(
          "The subject area, field of study, or domain this file relates to (e.g., 'Computer Science', 'Biology', 'Business Management')",
        ),
      author: z
        .string()
        .describe(
          "Author name(s) or organization that created this content. Use 'Unknown' if not found.",
        ),
      description: z
        .string()
        .describe(
          "A direct, engaging description that immediately tells what the content is about. NEVER start with meta-phrases like: 'This document', 'This paper', 'This module', 'This guide', 'This study', 'This content provides', 'This resource covers', etc. Instead, start directly with the actual topic. For example, instead of 'This document provides an introduction to electrical components', write 'Fundamental electrical components including resistors, capacitors, and...'",
        ),
    })
    .describe("Metadata about the file content"),
  concepts: z
    .array(
      z.object({
        title: z.string().describe("Clear, concise title of the concept"),
        reference: z
          .string()
          .describe("Direct quote or reference from the source material"),
        summary: z
          .string()
          .describe(
            "Comprehensive explanation of the concept for student learning",
          ),
      }),
    )
    .describe("Array of distinct concepts extracted from this file"),
});

export const generateMetadata = internalAction({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, { fileId }) => {
    try {
      await ctx.runMutation("files:saveMetadata", {
        fileId: fileId,
        metadata: {
          relatedArea: "",
          author: "",
          description: `Processing file content...`,
          concepts: [],
          generatedAt: Date.now(),
          status: "processing",
        },
      });

      const fileUrl = await ctx.runQuery("files:getFileUrl", {
        fileId: fileId,
      });

      const pdfResult = await ctx.runAction(
        internal.utils.pdf.encodePDFToBase64,
        { fileUrl: fileUrl },
      );

      // Call OpenRouter API with the base64 PDF
      const { object } = await generateObject({
        model: openrouter.chat("google/gemini-2.5-flash", {
          extraBody: {
            temperature: 0.1,
          },
        }),
        system: getSystemPrompt(),
        schema: conceptSchema,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Please analyze this PDF document and extract the key learning concepts. Return the response in the specified JSON format.`,
              },
              {
                type: "file",
                data: pdfResult.base64PDF,
                mimeType: "application/pdf",
              },
            ],
          },
        ],
      });

      console.log("object", object);

      const metadata = {
        relatedArea: object.fileMetadata.relatedArea,
        author: object.fileMetadata.author,
        description: object.fileMetadata.description,
        concepts: object.concepts,
        generatedAt: Date.now(),
        status: "success",
      };

      await ctx.runMutation("files:saveMetadata", {
        fileId: fileId,
        metadata,
      });
    } catch (error) {
      console.error(`Error generating metadata for file ${fileId}:`, error);
      await ctx.runMutation("files:saveMetadata", {
        fileId: fileId,
        metadata: {
          relatedArea: "",
          author: "",
          description: `Failed to process file`,
          concepts: [],
          generatedAt: Date.now(),
          status: "error",
        },
      });
    }
  },
});

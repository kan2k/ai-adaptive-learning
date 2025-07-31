"use node";

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
   - Only extract concepts that are directly related to the subject area of the document.
   - CRITICAL: Focus ONLY on the actual subject matter content, not educational methodology or textbook design.
   - EXCLUDE concepts about:
     * Educational frameworks, policies, or curriculum design (e.g., National Curriculum Framework, educational policies)
     * Textbook features, design principles, or teaching methodologies
     * Assessment methods, evaluation strategies, or learning approaches
     * Preface content, acknowledgments, or introductory sections about education
     * Characters, interactive elements, or pedagogical tools used in the book
   - INCLUDE concepts about:
     * Core subject matter, scientific principles, theories, or factual content
     * Practical applications, techniques, or procedures related to the subject
     * Definitions, classifications, or categorizations within the subject domain
     * Real-world examples, case studies, or phenomena explained in the subject context
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

// Configuration constants
const MAX_CHUNK_SIZE = 20000; // Characters per chunk - can be adjusted
const CHUNK_OVERLAP = 1000; // Overlap between chunks to maintain context

// Function to split text into overlapping chunks
const splitTextIntoChunks = (text, maxSize, overlap) => {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxSize;

    // If this isn't the last chunk, try to break at a natural boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(".", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > start + maxSize * 0.5) {
        end = breakPoint + 1;
      }
    }

    chunks.push({
      text: text.slice(start, end),
      chunkIndex: chunks.length,
      start,
      end: Math.min(end, text.length),
    });

    // Move start position with overlap
    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks;
};

// Function to merge concepts from multiple chunks
const mergeConcepts = (conceptArrays, fileName) => {
  const allConcepts = conceptArrays.flat();
  const mergedConcepts = [];
  const seenTitles = new Set();

  // Deduplicate concepts by title (case-insensitive)
  for (const concept of allConcepts) {
    const normalizedTitle = concept.title.toLowerCase().trim();
    if (!seenTitles.has(normalizedTitle)) {
      seenTitles.add(normalizedTitle);
      mergedConcepts.push(concept);
    }
  }

  // Limit to reasonable number of concepts
  return mergedConcepts;
};

// Function to merge file metadata from multiple chunks
const mergeFileMetadata = (metadataArray, fileName) => {
  // Use the first non-empty metadata as base
  const baseMetadata =
    metadataArray.find((m) => m.relatedArea && m.author && m.description) ||
    metadataArray[0];

  if (!baseMetadata) {
    return {
      relatedArea: "Unknown",
      author: "Unknown",
      description: `Analysis of ${fileName}`,
    };
  }

  return {
    relatedArea: baseMetadata.relatedArea || "Unknown",
    author: baseMetadata.author || "Unknown",
    description: baseMetadata.description || `Analysis of ${fileName}`,
  };
};

export const generateMetadataFromText = internalAction({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, { fileId }) => {
    console.log(`Starting metadata generation from text for file: ${fileId}`);

    try {
      // Update status to processing
      await ctx.runMutation("files:saveMetadata", {
        fileId: fileId,
        metadata: {
          relatedArea: "",
          author: "",
          description: `Processing content...`,
          concepts: [],
          generatedAt: Date.now(),
          status: "processing",
        },
      });

      console.log(`Getting file data for: ${fileId}`);
      const file = await ctx.runQuery("files:getFileById", {
        fileId: fileId,
      });

      if (!file || !file.textContent) {
        throw new Error("File not found or no text content available");
      }

      const textLength = file.textContent.length;
      console.log(
        `Text content found, length: ${textLength} characters for file: ${fileId}`,
      );

      // Check if we need to split into chunks
      if (textLength <= MAX_CHUNK_SIZE) {
        console.log(
          `Text is small enough, processing as single chunk for file: ${fileId}`,
        );

        // Process as single chunk (original logic)
        const result = await processSingleChunk(
          file.textContent,
          file.name,
          fileId,
          1,
          1,
        );

        const metadata = {
          relatedArea: result.fileMetadata.relatedArea || "Unknown",
          author: result.fileMetadata.author || "Unknown",
          description:
            result.fileMetadata.description || "Content analysis completed",
          concepts: Array.isArray(result.concepts) ? result.concepts : [],
          generatedAt: Date.now(),
          status: "success",
        };

        await ctx.runMutation("files:saveMetadata", {
          fileId: fileId,
          metadata,
        });

        console.log(
          `Metadata generation completed successfully for file: ${fileId}`,
        );
        return;
      }

      // Split text into chunks for large documents
      console.log(
        `Text is large (${textLength} chars), splitting into chunks for file: ${fileId}`,
      );
      const chunks = splitTextIntoChunks(
        file.textContent,
        MAX_CHUNK_SIZE,
        CHUNK_OVERLAP,
      );
      console.log(`Split into ${chunks.length} chunks for file: ${fileId}`);

      // Process chunks in batches to manage concurrency
      const CONCURRENT_BATCH_SIZE = 15;
      const allChunkResults = [];

      for (let i = 0; i < chunks.length; i += CONCURRENT_BATCH_SIZE) {
        const batchChunks = chunks.slice(i, i + CONCURRENT_BATCH_SIZE);
        console.log(
          `Processing batch of ${batchChunks.length} chunks, starting from chunk #${i + 1}`,
        );

        const chunkPromises = batchChunks.map((chunk, j) => {
          const chunkIndex = i + j + 1;
          return processSingleChunk(
            chunk.text,
            file.name,
            fileId,
            chunkIndex,
            chunks.length,
          ).catch((chunkError) => {
            console.error(
              `Error processing chunk ${chunkIndex} for file ${fileId}:`,
              chunkError,
            );
            return null; // Return null to avoid rejecting Promise.all
          });
        });

        const batchResults = await Promise.all(chunkPromises);
        allChunkResults.push(...batchResults);
      }

      const chunkResults = allChunkResults.filter((result) => result !== null);

      if (chunkResults.length === 0) {
        throw new Error("All chunks failed to process");
      }

      console.log(
        `Successfully processed ${chunkResults.length}/${chunks.length} chunks for file: ${fileId}`,
      );

      // Merge results from all chunks
      const allFileMetadata = chunkResults.map((r) => r.fileMetadata);
      const allConcepts = chunkResults.map((r) => r.concepts);

      const mergedFileMetadata = mergeFileMetadata(allFileMetadata, file.name);
      const mergedConcepts = mergeConcepts(allConcepts, file.name);

      const metadata = {
        relatedArea: mergedFileMetadata.relatedArea,
        author: mergedFileMetadata.author,
        description: mergedFileMetadata.description,
        concepts: mergedConcepts,
        generatedAt: Date.now(),
        status: "success",
      };

      console.log(`Saving merged metadata for file: ${fileId}`, {
        conceptCount: metadata.concepts.length,
        relatedArea: metadata.relatedArea,
        chunksProcessed: chunkResults.length,
      });

      await ctx.runMutation("files:saveMetadata", {
        fileId: fileId,
        metadata,
      });

      console.log(
        `Metadata generation completed successfully for file: ${fileId}`,
      );
    } catch (error) {
      console.error(`Error generating metadata for text file ${fileId}:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });

      // Determine error type for better user feedback
      let errorDescription = "Failed to process text content";
      if (error.message.includes("File not found")) {
        errorDescription = "File not found or no text content available";
      } else if (error.message.includes("AI analysis failed")) {
        errorDescription = "AI analysis service temporarily unavailable";
      } else if (error.message.includes("All chunks failed")) {
        errorDescription = "Failed to process document chunks";
      }

      await ctx.runMutation("files:saveMetadata", {
        fileId: fileId,
        metadata: {
          relatedArea: "",
          author: "",
          description: errorDescription,
          concepts: [],
          generatedAt: Date.now(),
          status: "error",
        },
      });

      // Re-throw for Convex to handle as needed
      throw error;
    }
  },
});

// Helper function to process a single chunk of text
const processSingleChunk = async (
  chunkText,
  fileName,
  fileId,
  chunkIndex,
  totalChunks,
) => {
  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    try {
      console.log(
        `AI analysis attempt ${retryCount + 1} for chunk ${chunkIndex}/${totalChunks} of file: ${fileId}`,
      );

      const prompt =
        totalChunks > 1
          ? `Please analyze this document chunk (part ${chunkIndex} of ${totalChunks}) and extract key learning concepts. The document name is "${fileName}".

IMPORTANT: Focus ONLY on the actual subject matter content. EXCLUDE educational methodology, textbook design, curriculum frameworks, teaching approaches, or preface content. Only extract concepts that directly relate to the core subject being taught.

If this is not the first chunk, focus on new concepts not likely covered in previous sections.

Document text chunk:
${chunkText}

Return the response in the specified JSON format.`
          : `Please analyze this document text and extract the key learning concepts. The document name is "${fileName}".

IMPORTANT: Focus ONLY on the actual subject matter content. EXCLUDE educational methodology, textbook design, curriculum frameworks, teaching approaches, or preface content. Only extract concepts that directly relate to the core subject being taught.

Document text:
${chunkText}

Return the response in the specified JSON format.`;

      const result = await generateObject({
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
            content: prompt,
          },
        ],
      });

      console.log(
        `AI analysis completed successfully for chunk ${chunkIndex}/${totalChunks} of file: ${fileId}`,
      );
      return result.object;
    } catch (aiError) {
      retryCount++;
      console.error(
        `AI analysis attempt ${retryCount} failed for chunk ${chunkIndex} of file ${fileId}:`,
        aiError,
      );

      if (retryCount >= maxRetries) {
        throw new Error(
          `AI analysis failed after ${maxRetries} attempts for chunk ${chunkIndex}: ${aiError.message}`,
        );
      }

      // Wait before retry (exponential backoff)
      const waitTime = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
      console.log(
        `Retrying AI analysis in ${waitTime}ms for chunk ${chunkIndex} of file: ${fileId}`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
};

export const generateMetadata = internalAction({
  args: {
    fileId: v.id("files"),
  },
  handler: async (ctx, { fileId }) => {
    console.log(`Starting metadata generation for file: ${fileId}`);

    try {
      // Update status to processing
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

      console.log(`Getting file URL for: ${fileId}`);
      const fileUrl = await ctx.runQuery("files:getFileUrl", {
        fileId: fileId,
      });

      if (!fileUrl) {
        throw new Error("File URL not found or file does not exist");
      }

      console.log(`File URL retrieved, starting PDF encoding for: ${fileId}`);

      // Encode PDF to base64 directly here to avoid return size limitations
      let base64PDF;
      try {
        console.log(`Fetching PDF from URL for file: ${fileId}`);
        const response = await fetch(fileUrl, {
          timeout: 60000, // 60 second timeout
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Check content length before processing
        const contentLength = response.headers.get("content-length");
        if (contentLength) {
          const fileSizeMB = parseInt(contentLength) / (1024 * 1024);
          console.log(
            `PDF content-length: ${fileSizeMB.toFixed(2)} MB for file: ${fileId}`,
          );

          // Reject files larger than 25MB to prevent memory issues
          if (fileSizeMB > 25) {
            throw new Error(
              `File too large (${fileSizeMB.toFixed(2)} MB). Maximum supported size is 25MB to ensure reliable processing.`,
            );
          }

          // Warn about large files
          if (fileSizeMB > 15) {
            console.warn(
              `Large PDF detected (${fileSizeMB.toFixed(2)} MB) for file: ${fileId}, processing may be slow`,
            );
          }
        }

        console.log(
          `PDF fetched successfully, converting to buffer for file: ${fileId}`,
        );

        // Process in chunks to avoid memory spikes
        const chunks = [];
        const reader = response.body.getReader();
        let totalSize = 0;
        const maxSize = 25 * 1024 * 1024; // 25MB limit

        // Add timeout for chunked reading
        const chunkTimeout = 30000; // 30 seconds for chunked reading
        const startTime = Date.now();

        try {
          while (true) {
            // Check if we've exceeded the timeout
            if (Date.now() - startTime > chunkTimeout) {
              throw new Error(
                `Chunked reading timeout after ${chunkTimeout / 1000} seconds`,
              );
            }

            const { done, value } = await reader.read();
            if (done) break;

            totalSize += value.length;
            if (totalSize > maxSize) {
              throw new Error(`File size exceeds 25MB limit during processing`);
            }

            chunks.push(value);

            // Log progress every 5MB
            if (chunks.length % 100 === 0) {
              console.log(
                `Processed ${(totalSize / (1024 * 1024)).toFixed(2)} MB so far for file: ${fileId}`,
              );
            }
          }
        } finally {
          reader.releaseLock();
        }

        console.log(
          `PDF chunks collected, total size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB for file: ${fileId}`,
        );

        // Buffer creation with error handling
        try {
          // For files > 15MB, use optimized buffer creation
          if (totalSize > 15 * 1024 * 1024) {
            // > 15MB
            console.log(
              `Large file detected, using optimized buffer creation for file: ${fileId}`,
            );

            // Create buffer more efficiently for large files
            console.log(
              `Creating buffer from ${chunks.length} chunks for file: ${fileId}`,
            );
            const bufferChunks = chunks.map((chunk) => Buffer.from(chunk));
            console.log(
              `Buffer chunks created, concatenating for file: ${fileId}`,
            );
            const buffer = Buffer.concat(bufferChunks);

            // Clear chunks array to free memory
            chunks.length = 0;

            console.log(`Converting large file to base64 for file: ${fileId}`);
            base64PDF = `data:application/pdf;base64,${buffer.toString("base64")}`;
          } else {
            // Original approach for smaller files
            console.log(
              `Converting to base64 using standard approach for file: ${fileId}`,
            );
            const arrayBuffer = new Uint8Array(totalSize);
            let offset = 0;
            for (const chunk of chunks) {
              arrayBuffer.set(chunk, offset);
              offset += chunk.length;
            }

            const buffer = Buffer.from(arrayBuffer);
            base64PDF = `data:application/pdf;base64,${buffer.toString("base64")}`;
          }

          console.log(`PDF successfully encoded to base64 for file: ${fileId}`);
        } catch (bufferError) {
          console.error(
            `Error during buffer creation/base64 conversion for file ${fileId}:`,
            bufferError,
          );
          throw new Error(`Buffer processing failed: ${bufferError.message}`);
        }
      } catch (error) {
        console.error(
          `Error encoding PDF to base64 for file ${fileId}:`,
          error,
        );
        throw new Error(`Failed to encode PDF: ${error.message}`);
      }

      console.log(`Starting AI analysis for file: ${fileId}`);

      // Call OpenRouter API with the base64 PDF with retry logic
      let object;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          console.log(
            `AI analysis attempt ${retryCount + 1} for file: ${fileId}`,
          );

          const result = await generateObject({
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
                    text: `Please analyze this PDF document and extract the key learning concepts. 

IMPORTANT: Focus ONLY on the actual subject matter content. EXCLUDE educational methodology, textbook design, curriculum frameworks, teaching approaches, or preface content. Only extract concepts that directly relate to the core subject being taught.

Return the response in the specified JSON format.`,
                  },
                  {
                    type: "file",
                    data: base64PDF,
                    mimeType: "application/pdf",
                  },
                ],
              },
            ],
          });

          object = result.object;
          console.log(`AI analysis completed successfully for file: ${fileId}`);
          break; // Success, exit retry loop
        } catch (aiError) {
          retryCount++;
          console.error(
            `AI analysis attempt ${retryCount} failed for file ${fileId}:`,
            aiError,
          );

          if (retryCount >= maxRetries) {
            throw new Error(
              `AI analysis failed after ${maxRetries} attempts: ${aiError.message}`,
            );
          }

          // Wait before retry (exponential backoff)
          const waitTime = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
          console.log(
            `Retrying AI analysis in ${waitTime}ms for file: ${fileId}`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }

      console.log(`Processing AI response for file: ${fileId}`, object);

      // Validate the response structure
      if (!object || !object.fileMetadata || !object.concepts) {
        throw new Error(
          "Invalid AI response structure: missing required fields",
        );
      }

      const metadata = {
        relatedArea: object.fileMetadata.relatedArea || "Unknown",
        author: object.fileMetadata.author || "Unknown",
        description:
          object.fileMetadata.description || "Content analysis completed",
        concepts: Array.isArray(object.concepts) ? object.concepts : [],
        generatedAt: Date.now(),
        status: "success",
      };

      console.log(`Saving metadata for file: ${fileId}`, {
        conceptCount: metadata.concepts.length,
        relatedArea: metadata.relatedArea,
      });

      await ctx.runMutation("files:saveMetadata", {
        fileId: fileId,
        metadata,
      });

      console.log(
        `Metadata generation completed successfully for file: ${fileId}`,
      );
    } catch (error) {
      console.error(`Error generating metadata for file ${fileId}:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });

      // Determine error type for better user feedback
      let errorDescription = "Failed to process file";
      if (error.message.includes("File URL not found")) {
        errorDescription = "File not found or inaccessible";
      } else if (error.message.includes("Failed to encode PDF")) {
        errorDescription = "Unable to read PDF file";
      } else if (error.message.includes("AI analysis failed")) {
        errorDescription = "AI analysis service temporarily unavailable";
      } else if (error.message.includes("HTTP 4")) {
        errorDescription = "File access denied";
      } else if (error.message.includes("timeout")) {
        errorDescription = "File processing timeout - file may be too large";
      }

      await ctx.runMutation("files:saveMetadata", {
        fileId: fileId,
        metadata: {
          relatedArea: "",
          author: "",
          description: errorDescription,
          concepts: [],
          generatedAt: Date.now(),
          status: "error",
        },
      });

      // Re-throw for Convex to handle as needed
      throw error;
    }
  },
});

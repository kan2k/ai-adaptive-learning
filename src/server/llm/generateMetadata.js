import { generateObject } from "ai";
import { logError } from "../log.js";
import { z } from "zod";
import { getModel, hasLLM, MissingApiKeyError } from "./providers.js";
import { getFileById, saveFileMetadata, getCourseFiles } from "../db.js";

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

// For markdown sources, each concept records the nearest # heading above the
// place its reference quote appears; a concept whose quote can't be located
// keeps file-name-only attribution.
const lastHeadingBefore = (text, offset) => {
  const matches = text.slice(0, offset).match(/^#{1,6}[ \t].*$/gm);
  if (!matches || matches.length === 0) return undefined;
  return matches[matches.length - 1].replace(/^#{1,6}[ \t]+/, "").trim();
};

const annotateConceptHeadings = (file, concepts) => {
  if (!file.type?.includes("markdown") || !file.textContent) return concepts;
  return concepts.map((concept) => {
    const ref = (concept.reference || "").trim();
    let idx = ref ? file.textContent.indexOf(ref) : -1;
    if (idx < 0 && ref.length > 40) {
      idx = file.textContent.indexOf(ref.slice(0, 40));
    }
    if (idx < 0) return concept;
    const heading = lastHeadingBefore(file.textContent, idx);
    return heading ? { ...concept, sourceHeading: heading } : concept;
  });
};

const MAX_CHUNK_SIZE = 20000;
const CHUNK_OVERLAP = 1000;
const CONCURRENT_BATCH_SIZE = 15;

const splitTextIntoChunks = (text, maxSize, overlap) => {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxSize;

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

    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks;
};

const mergeConcepts = (conceptArrays) => {
  const allConcepts = conceptArrays.flat();
  const mergedConcepts = [];
  const seenTitles = new Set();

  for (const concept of allConcepts) {
    const normalizedTitle = concept.title.toLowerCase().trim();
    if (!seenTitles.has(normalizedTitle)) {
      seenTitles.add(normalizedTitle);
      mergedConcepts.push(concept);
    }
  }

  return mergedConcepts;
};

const mergeFileMetadata = (metadataArray, fileName) => {
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

const processSingleChunk = async (chunkText, fileName, fileId, chunkIndex, totalChunks) => {
  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    try {
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
        model: getModel({ tier: "fast", temperature: 0.1 }),
        system: getSystemPrompt(),
        schema: conceptSchema,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      });

      return result.object;
    } catch (aiError) {
      if (aiError.name === "MissingApiKeyError") throw aiError;
      retryCount++;
      logError("llm", aiError, { where: `AI analysis attempt ${retryCount} failed for chunk ${chunkIndex} of file ${fileId}:` });

      if (retryCount >= maxRetries) {
        throw new Error(
          `AI analysis failed after ${maxRetries} attempts for chunk ${chunkIndex}: ${aiError.message}`,
        );
      }

      const waitTime = Math.pow(2, retryCount) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
};

export async function generateMetadataFromText(fileId) {
  try {
    if (!hasLLM()) throw new MissingApiKeyError();
    saveFileMetadata(fileId, {
      relatedArea: "",
      author: "",
      description: "Processing content...",
      concepts: [],
      generatedAt: Date.now(),
      status: "processing",
    });

    const file = getFileById(fileId);
    if (!file || !file.textContent) {
      throw new Error("File not found or no text content available");
    }

    const textLength = file.textContent.length;

    if (textLength <= MAX_CHUNK_SIZE) {
      const result = await processSingleChunk(
        file.textContent,
        file.name,
        fileId,
        1,
        1,
      );

      saveFileMetadata(fileId, {
        relatedArea: result.fileMetadata.relatedArea || "Unknown",
        author: result.fileMetadata.author || "Unknown",
        description:
          result.fileMetadata.description || "Content analysis completed",
        concepts: annotateConceptHeadings(
          file,
          Array.isArray(result.concepts) ? result.concepts : [],
        ),
        generatedAt: Date.now(),
        status: "success",
      });
      return;
    }

    const chunks = splitTextIntoChunks(
      file.textContent,
      MAX_CHUNK_SIZE,
      CHUNK_OVERLAP,
    );

    const allChunkResults = [];
    for (let i = 0; i < chunks.length; i += CONCURRENT_BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + CONCURRENT_BATCH_SIZE);
      const chunkPromises = batchChunks.map((chunk, j) => {
        const chunkIndex = i + j + 1;
        return processSingleChunk(
          chunk.text,
          file.name,
          fileId,
          chunkIndex,
          chunks.length,
        ).catch((chunkError) => {
          logError("llm", chunkError, { where: `Error processing chunk ${chunkIndex} for file ${fileId}:` });
          return null;
        });
      });
      const batchResults = await Promise.all(chunkPromises);
      allChunkResults.push(...batchResults);
    }

    const chunkResults = allChunkResults.filter((result) => result !== null);
    if (chunkResults.length === 0) {
      throw new Error("All chunks failed to process");
    }

    const mergedFileMetadata = mergeFileMetadata(
      chunkResults.map((r) => r.fileMetadata),
      file.name,
    );
    const mergedConcepts = mergeConcepts(chunkResults.map((r) => r.concepts));

    saveFileMetadata(fileId, {
      relatedArea: mergedFileMetadata.relatedArea,
      author: mergedFileMetadata.author,
      description: mergedFileMetadata.description,
      concepts: annotateConceptHeadings(file, mergedConcepts),
      generatedAt: Date.now(),
      status: "success",
    });
  } catch (error) {
    logError("llm", error, { where: `Error generating metadata for file ${fileId}:` });

    let errorDescription = "Failed to process text content";
    if (error.name === "MissingApiKeyError") {
      errorDescription = error.message;
    } else if (error.message.includes("File not found")) {
      errorDescription = "File not found or no text content available";
    } else if (error.message.includes("AI analysis failed")) {
      errorDescription = "AI analysis service temporarily unavailable";
    } else if (error.message.includes("All chunks failed")) {
      errorDescription = "Failed to process document chunks";
    }

    saveFileMetadata(fileId, {
      relatedArea: "",
      author: "",
      description: errorDescription,
      concepts: [],
      generatedAt: Date.now(),
      status: "error",
    });
  }
}

// Kicks off generation for course files that have no metadata yet.
// Non-blocking; in-flight set prevents duplicate runs across polls.
export function ensureMetadataForCourse(courseId) {
  if (!globalThis.__metadataInFlight) {
    globalThis.__metadataInFlight = new Set();
  }
  const inFlight = globalThis.__metadataInFlight;

  const files = getCourseFiles(courseId);
  for (const file of files) {
    const needsRun =
      !file.metadata ||
      (file.metadata.status === "error" &&
        file.metadata.description?.includes("No LLM configured") &&
        hasLLM());
    if (!needsRun || inFlight.has(file._id)) continue;
    inFlight.add(file._id);
    generateMetadataFromText(file._id)
      .catch((error) =>
        logError("llm", error, { where: `Metadata generation failed for file ${file._id}:` }),
      )
      .finally(() => inFlight.delete(file._id));
  }
}

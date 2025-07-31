"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { generateObject } from "ai";
import { openrouter } from "../providers";
import { z } from "zod";
import { api, internal } from "../../_generated/api";

// Define the flashcard generation schema
const FlashcardGenerationSchema = z.object({
  flashcards: z.array(
    z.object({
      conceptTitle: z.string().describe("The concept this flashcard covers"),
      flashcardContent: z
        .string()
        .describe("Bite-sized memory text content for the concept"),
      flashcardImageDescription: z
        .string()
        .describe("The description of the flashcard image"),
    }),
  ),
});

// Configuration constants
const CONCEPTS_PER_CHUNK = 50; // Process 50 concepts per chunk
const CONCURRENT_BATCH_SIZE = 10; // Process 10 chunks concurrently

// Function to split concepts into chunks
const splitConceptsIntoChunks = (allConcepts, maxConceptsPerChunk) => {
  const chunks = [];
  for (let i = 0; i < allConcepts.length; i += maxConceptsPerChunk) {
    chunks.push({
      concepts: allConcepts.slice(i, i + maxConceptsPerChunk),
      chunkIndex: chunks.length + 1,
      startIndex: i,
      endIndex: Math.min(i + maxConceptsPerChunk, allConcepts.length),
    });
  }
  return chunks;
};

// Function to merge flashcards from multiple chunks
const mergeFlashcards = (flashcardArrays) => {
  const allFlashcards = flashcardArrays.flat();
  const mergedFlashcards = [];
  const seenConcepts = new Set();

  // Deduplicate flashcards by concept title (case-insensitive)
  for (const flashcard of allFlashcards) {
    const normalizedConcept = flashcard.conceptTitle.toLowerCase().trim();
    if (!seenConcepts.has(normalizedConcept)) {
      seenConcepts.add(normalizedConcept);
      mergedFlashcards.push(flashcard);
    }
  }

  return mergedFlashcards;
};

// Function to generate personalized system prompt based on user preferences
const generatePersonalizedSystemPrompt = (userPreferences) => {
  const defaultPreferences = {
    languageComplexity: "High School",
    analogyUsage: "Occasional",
  };

  const prefs = userPreferences || defaultPreferences;

  const languageComplexityGuidelines = {
    Primary:
      "Use simple words, short sentences, and minimal jargon. Keep explanations very basic and easy to understand.",
    "High School":
      "Use moderate vocabulary, compound sentences, and some subject-specific terms. Balance accessibility with depth.",
    University:
      "Use academic language and subject-specific terminology. Assume advanced comprehension and precise meaning.",
  };

  const analogyUsageGuidelines = {
    Frequent:
      "Frequently use relatable analogies or metaphors to explain concepts. Make connections to everyday experiences.",
    Occasional:
      "Use analogies sparingly to enhance understanding when they add significant value.",
    Limited:
      "Be direct and literal, focusing on definitions and formal logic rather than metaphor.",
  };

  return `
<role>
  You are an expert educational content creator that generates bite-sized memory text content for learning and memorization.
  Your task is to create engaging, educational content that helps students master key concepts through spaced repetition.
</role>

<instructions>
1. Generate at least 1 bite-sized memory text per concept, more for complex concepts
2. Create clear, concise content that captures the essence of each concept
3. Include descriptive image suggestions that would help visualize the concept
4. Make content engaging and suitable for spaced repetition learning
5. Focus on the most important aspects of each concept
6. Ensure content is educational and helps with retention
7. Use clear, accessible language appropriate for students

Each memory text should be a valuable learning tool that helps students understand and remember the concept.
</instructions>

<memory_text_structure>
Create bite-sized memory text content that includes:
- The main definition or explanation
- Key points for easy recall
- Examples or applications when helpful
- Memory aids or mnemonics when appropriate

Focus on creating content that aids memorization and retention, not just factual recall.
Keep each piece of content concise but comprehensive enough to be self-contained.
</memory_text_structure>

<personalization_guidelines>
**Language Complexity:** ${languageComplexityGuidelines[prefs.languageComplexity]}
**Analogy Usage:** ${analogyUsageGuidelines[prefs.analogyUsage]}

Tailor your memory text content to match these preferences while maintaining educational value and clarity.
</personalization_guidelines>

<input_information>
You will be given concepts from course materials and need to generate bite-sized memory text for each concept.
</input_information>
`;
};

// Function to process a single chunk of concepts
const processConceptChunk = async (
  chunk,
  chunkIndex,
  totalChunks,
  courseName,
  userPreferences,
) => {
  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    try {
      console.log(
        `Flashcard generation attempt ${retryCount + 1} for chunk ${chunkIndex}/${totalChunks}`,
      );

      const prompt = `Please generate bite-sized memory text content for this chunk of learning concepts (part ${chunkIndex} of ${totalChunks}). The course name is "${courseName}".

IMPORTANT INSTRUCTIONS:
1. Generate at least 1 bite-sized memory text per concept, use more if concept is complex or lengthy
2. Each memory text should focus on a key aspect of the concept for memorization
3. Create content that helps with spaced repetition learning and retention
4. Include clear, concise explanations that aid understanding and recall
5. Generate descriptive image suggestions that would help visualize the concept
6. Focus on the most important aspects of each concept that need to be memorized
7. Structure content to support active recall and long-term retention

MEMORY TEXT FORMAT:
- Create bite-sized memory text that includes:
  * Main definition or explanation
  * Key points for easy recall
  * Examples or applications when helpful
  * Memory aids or mnemonics when appropriate
- Keep each piece concise but comprehensive enough to be self-contained

Concepts in this chunk:
${chunk.concepts.map((concept, index) => `${index + 1}. ${concept.title}: ${concept.reference}`).join("\n")}

Return the response in the specified JSON format with the generated memory text content.`;

      const result = await generateObject({
        model: openrouter("google/gemini-2.5-flash"),
        schema: FlashcardGenerationSchema,
        system: generatePersonalizedSystemPrompt(userPreferences),
        prompt: prompt,
        temperature: 0.3,
      });

      console.log(
        `Flashcard generation completed successfully for chunk ${chunkIndex}/${totalChunks}`,
      );
      return result.object;
    } catch (aiError) {
      retryCount++;
      console.error(
        `Flashcard generation attempt ${retryCount} failed for chunk ${chunkIndex}:`,
        aiError,
      );

      if (retryCount >= maxRetries) {
        throw new Error(
          `Flashcard generation failed after ${maxRetries} attempts for chunk ${chunkIndex}: ${aiError.message}`,
        );
      }

      // Wait before retry (exponential backoff)
      const waitTime = Math.pow(2, retryCount) * 1000; // 2s, 4s, 8s
      console.log(
        `Retrying flashcard generation in ${waitTime}ms for chunk ${chunkIndex}`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
};

export const generateFlashcards = internalAction({
  args: {
    courseId: v.id("courses"),
  },
  returns: v.object({
    success: v.boolean(),
    flashcardsGenerated: v.optional(v.number()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { courseId }) => {
    try {
      console.log(`Starting flashcard generation for course: ${courseId}`);

      // Get user preferences for personalization from authentication context
      const identity = await ctx.auth.getUserIdentity();
      let userPreferences = null;

      if (identity) {
        const user = await ctx.runQuery(
          internal.users.internalGetUserByTokenIdentifier,
          { tokenIdentifier: identity.tokenIdentifier },
        );
        userPreferences = user?.preferences || null;
      }

      console.log(`User preferences for course ${courseId}:`, userPreferences);

      const courseWithFiles = await ctx.runQuery(
        api.courses.getCourseWithFiles,
        { courseId },
      );
      if (!courseWithFiles) {
        return { success: false, error: "Course not found" };
      }

      if (!courseWithFiles.files || courseWithFiles.files.length === 0) {
        return { success: false, error: "No files found in course" };
      }

      // Collect all metadata from course files
      const courseMaterials = [];
      for (const file of courseWithFiles.files) {
        if (file.metadata && file.metadata.concepts) {
          courseMaterials.push({
            fileName: file.name,
            relatedArea: file.metadata.relatedArea,
            author: file.metadata.author,
            description: file.metadata.description,
            concepts: file.metadata.concepts,
          });
        }
      }

      if (courseMaterials.length === 0) {
        return {
          success: false,
          error: "No processed metadata found in course files",
        };
      }

      // Extract all concepts from course materials
      const allConcepts = [];
      for (const material of courseMaterials) {
        for (const concept of material.concepts) {
          allConcepts.push({
            ...concept,
            sourceFile: material.fileName,
            relatedArea: material.relatedArea,
            author: material.author,
          });
        }
      }

      console.log(
        `Found ${allConcepts.length} total concepts for flashcard generation in course: ${courseId}`,
      );

      // Check if we need to split into chunks
      if (allConcepts.length <= CONCEPTS_PER_CHUNK) {
        console.log(
          `Concepts count (${allConcepts.length}) is small enough, processing as single chunk for course: ${courseId}`,
        );

        // Process as single chunk
        const materialsContent = courseMaterials
          .map(
            (material) =>
              `--- File: ${material.fileName} ---
        Subject Area: ${material.relatedArea}
        Author: ${material.author}
        Description: ${material.description}
        Concepts:
        ${material.concepts
          .map((concept) => `- ${concept.title}: ${concept.reference}`)
          .join("\n")}`,
          )
          .join("\n\n");

        const { object } = await generateObject({
          model: openrouter("google/gemini-2.5-flash"),
          schema: FlashcardGenerationSchema,
          system: generatePersonalizedSystemPrompt(userPreferences),
          prompt: `Please generate bite-sized memory text content for all the learning concepts in this course. The course name is "${courseWithFiles.name || "Course"}".

IMPORTANT INSTRUCTIONS:
1. Generate at least 1 bite-sized memory text per concept, use more if concept is complex or lengthy
2. Each memory text should focus on a key aspect of the concept for memorization
3. Create content that helps with spaced repetition learning and retention
4. Include clear, concise explanations that aid understanding and recall
5. Generate descriptive image suggestions that would help visualize the concept
6. Focus on the most important aspects of each concept that need to be memorized
7. Structure content to support active recall and long-term retention

MEMORY TEXT FORMAT:
- Create bite-sized memory text that includes:
  * Main definition or explanation
  * Key points for easy recall
  * Examples or applications when helpful
  * Memory aids or mnemonics when appropriate
- Keep each piece concise but comprehensive enough to be self-contained

Course materials:
${materialsContent}

Return the response in the specified JSON format with the generated memory text content.`,
          temperature: 0.3,
        });

        // Replace the flashcards in the course (instead of appending)
        if (object.flashcards && object.flashcards.length > 0) {
          const flashcardsToAdd = object.flashcards.map((flashcard) => ({
            conceptTitle: flashcard.conceptTitle,
            relatedArea: flashcard.conceptTitle,
            suggestionImage: flashcard.flashcardImageDescription,
            flashCardText: flashcard.flashcardContent,
            generationType: "pre-generated",
          }));

          await ctx.runMutation(api.flashcards.replaceFlashcards, {
            courseId,
            flashcards: flashcardsToAdd,
          });
        }

        return {
          success: true,
          flashcardsGenerated: object.flashcards?.length || 0,
        };
      }

      // Split concepts into chunks for large courses
      console.log(
        `Concepts count (${allConcepts.length}) is large, splitting into chunks for course: ${courseId}`,
      );
      const chunks = splitConceptsIntoChunks(allConcepts, CONCEPTS_PER_CHUNK);
      console.log(`Split into ${chunks.length} chunks for course: ${courseId}`);

      // Process chunks in batches to manage concurrency
      const allChunkResults = [];

      for (let i = 0; i < chunks.length; i += CONCURRENT_BATCH_SIZE) {
        const batchChunks = chunks.slice(i, i + CONCURRENT_BATCH_SIZE);
        console.log(
          `Processing batch of ${batchChunks.length} chunks, starting from chunk #${i + 1} for course: ${courseId}`,
        );

        const chunkPromises = batchChunks.map((chunk, j) => {
          const chunkIndex = i + j + 1;
          return processConceptChunk(
            chunk,
            chunkIndex,
            chunks.length,
            courseWithFiles.name || "Course",
            userPreferences,
          ).catch((chunkError) => {
            console.error(
              `Error processing chunk ${chunkIndex} for course ${courseId}:`,
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
        `Successfully processed ${chunkResults.length}/${chunks.length} chunks for course: ${courseId}`,
      );

      // Merge results from all chunks
      const allFlashcardArrays = chunkResults.map((r) => r.flashcards);
      const mergedFlashcards = mergeFlashcards(allFlashcardArrays);

      console.log(`Saving merged flashcards for course: ${courseId}`, {
        flashcardCount: mergedFlashcards.length,
        totalConcepts: allConcepts.length,
        chunksProcessed: chunkResults.length,
      });

      // Replace the flashcards in the course (instead of appending)
      if (mergedFlashcards.length > 0) {
        const flashcardsToAdd = mergedFlashcards.map((flashcard) => ({
          conceptTitle: flashcard.conceptTitle,
          relatedArea: flashcard.conceptTitle,
          suggestionImage: flashcard.flashcardImageDescription,
          flashCardText: flashcard.flashcardContent,
          generationType: "pre-generated",
        }));

        await ctx.runMutation(api.flashcards.replaceFlashcards, {
          courseId,
          flashcards: flashcardsToAdd,
        });
      }

      return {
        success: true,
        flashcardsGenerated: mergedFlashcards.length,
      };
    } catch (error) {
      console.error("Error generating flashcards:", error);

      return {
        success: false,
        error: `Failed to generate flashcards: ${error.message}`,
      };
    }
  },
});

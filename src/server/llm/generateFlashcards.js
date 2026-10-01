import { generateObject } from "ai";
import { logError } from "../log.js";
import { z } from "zod";
import { getModel } from "./providers.js";
import { getCourseWithFiles, getPreferences } from "../db.js";
import { replaceFlashcards } from "../learning.js";

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

const CONCEPTS_PER_CHUNK = 50;
const CONCURRENT_BATCH_SIZE = 10;

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

const mergeFlashcards = (flashcardArrays) => {
  const allFlashcards = flashcardArrays.flat();
  const mergedFlashcards = [];
  const seenConcepts = new Set();

  for (const flashcard of allFlashcards) {
    const normalizedConcept = flashcard.conceptTitle.toLowerCase().trim();
    if (!seenConcepts.has(normalizedConcept)) {
      seenConcepts.add(normalizedConcept);
      mergedFlashcards.push(flashcard);
    }
  }

  return mergedFlashcards;
};

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

const processConceptChunk = async (chunk, chunkIndex, totalChunks, courseName, userPreferences) => {
  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    try {
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
        model: getModel(),
        schema: FlashcardGenerationSchema,
        system: generatePersonalizedSystemPrompt(userPreferences),
        prompt,
        temperature: 0.3,
      });

      return result.object;
    } catch (aiError) {
      retryCount++;
      logError("llm", aiError, { where: `Flashcard generation attempt ${retryCount} failed for chunk ${chunkIndex}:` });

      if (retryCount >= maxRetries) {
        throw new Error(
          `Flashcard generation failed after ${maxRetries} attempts for chunk ${chunkIndex}: ${aiError.message}`,
        );
      }

      const waitTime = Math.pow(2, retryCount) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
};

export async function generateFlashcards(courseId) {
  try {
    const userPreferences = getPreferences();

    const courseWithFiles = getCourseWithFiles(courseId);
    if (!courseWithFiles) {
      return { success: false, error: "Course not found" };
    }
    if (!courseWithFiles.files || courseWithFiles.files.length === 0) {
      return { success: false, error: "No files found in course" };
    }

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

    if (allConcepts.length <= CONCEPTS_PER_CHUNK) {
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
        model: getModel(),
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

      if (object.flashcards && object.flashcards.length > 0) {
        const flashcardsToAdd = object.flashcards.map((flashcard) => ({
          conceptTitle: flashcard.conceptTitle,
          relatedArea: flashcard.conceptTitle,
          suggestionImage: flashcard.flashcardImageDescription,
          flashCardText: flashcard.flashcardContent,
          generationType: "pre-generated",
        }));
        replaceFlashcards(courseId, flashcardsToAdd);
      }

      return {
        success: true,
        flashcardsGenerated: object.flashcards?.length || 0,
      };
    }

    const chunks = splitConceptsIntoChunks(allConcepts, CONCEPTS_PER_CHUNK);
    const allChunkResults = [];

    for (let i = 0; i < chunks.length; i += CONCURRENT_BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + CONCURRENT_BATCH_SIZE);
      const chunkPromises = batchChunks.map((chunk, j) => {
        const chunkIndex = i + j + 1;
        return processConceptChunk(
          chunk,
          chunkIndex,
          chunks.length,
          courseWithFiles.name || "Course",
          userPreferences,
        ).catch((chunkError) => {
          logError("llm", chunkError, { where: `Error processing chunk ${chunkIndex} for course ${courseId}:` });
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

    const mergedFlashcards = mergeFlashcards(
      chunkResults.map((r) => r.flashcards),
    );

    if (mergedFlashcards.length > 0) {
      const flashcardsToAdd = mergedFlashcards.map((flashcard) => ({
        conceptTitle: flashcard.conceptTitle,
        relatedArea: flashcard.conceptTitle,
        suggestionImage: flashcard.flashcardImageDescription,
        flashCardText: flashcard.flashcardContent,
        generationType: "pre-generated",
      }));
      replaceFlashcards(courseId, flashcardsToAdd);
    }

    return {
      success: true,
      flashcardsGenerated: mergedFlashcards.length,
    };
  } catch (error) {
    logError("llm", error, { where: "Error generating flashcards:" });
    return {
      success: false,
      error: `Failed to generate flashcards: ${error.message}`,
    };
  }
}

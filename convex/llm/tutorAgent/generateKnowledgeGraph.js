"use node";

import { action, internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { generateObject } from "ai";
import { openai, openrouter } from "../providers";
import { z } from "zod";
import { api } from "../../_generated/api";

// Define the knowledge graph schema
const KnowledgeGraphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string().describe("Unique identifier for the node"),
      title: z.string().describe("Concept title/name"),
      parent: z
        .union([z.string(), z.null()])
        .describe("Parent node ID (null for root nodes)"),
      children: z.array(z.any()).describe("Children nodes ID"),
      description: z.string().describe("Brief description of the concept"),
      order: z
        .number()
        .describe(
          "Display order among parent's children (also indicates importance - lower numbers are more important)",
        ),
      keyTerms: z
        .array(z.string())
        .describe(
          "Important terms and vocabulary for this concept, do not include the title of the concept",
        )
        .optional(),
    }),
  ),
});

// Configuration constants
const CONCEPTS_PER_CHUNK = 80; // Process 50 concepts per chunk

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

// Function to merge knowledge graph nodes from multiple chunks
const mergeKnowledgeGraphNodes = (nodeArrays) => {
  const allNodes = nodeArrays.flat();
  const mergedNodes = [];
  const seenIds = new Set();

  // Deduplicate nodes by ID
  for (const node of allNodes) {
    if (!seenIds.has(node.id)) {
      seenIds.add(node.id);
      mergedNodes.push(node);
    }
  }

  // Sort nodes by order (importance)
  mergedNodes.sort((a, b) => a.order - b.order);

  return mergedNodes;
};

// Function to process a single chunk of concepts
const processConceptChunk = async (
  chunk,
  existingNodes,
  chunkIndex,
  totalChunks,
  courseName,
) => {
  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    try {
      console.log(
        `AI analysis attempt ${retryCount + 1} for chunk ${chunkIndex}/${totalChunks}`,
      );

      const existingNodesContext =
        existingNodes.length > 0
          ? `\n\nExisting knowledge graph nodes (for reference and to avoid duplication):
${existingNodes.map((node) => `- ${node.title} (ID: ${node.id}, Order: ${node.order})`).join("\n")}`
          : "";

      const prompt = `Please analyze this chunk of learning concepts (part ${chunkIndex} of ${totalChunks}) and create knowledge graph nodes. The course name is "${courseName}".

IMPORTANT INSTRUCTIONS:
1. Create knowledge graph nodes for the concepts in this chunk
2. If there are existing nodes, reference them to maintain consistency and avoid duplication
3. Use parent-child relationships to show concept dependencies
4. Order nodes by importance (lower order numbers = more important)
5. Keep descriptions concise but informative
6. Include key terms that students should know for each concept
7. Ensure logical hierarchy and learning progression
8. If a concept is similar to an existing one, consider merging or creating a parent-child relationship

Concepts in this chunk:
${chunk.concepts.map((concept, index) => `${index + 1}. ${concept.title}: ${concept.reference}`).join("\n")}${existingNodesContext}

Return the response in the specified JSON format with the new knowledge graph nodes.`;

      const result = await generateObject({
        model: openrouter("google/gemini-2.5-flash"),
        schema: KnowledgeGraphSchema,
        system: `
        <role>
          You are an expert educational content analyzer that extracts key learning concepts and figures out the dependencies between them.
          Your task is to sort concepts into a hierarchy of dependencies (knowledge tree) that students should learn from each from the most important to the least important.
        </role>

        <instructions>
        1. Identify key concepts from the provided chunk and organize them in a hierarchical tree structure
        2. Create nodes for each important learning concept from the processed metadata
        3. Use parent-child relationships to show concept dependencies and organization
        4. Order nodes by importance (lower order numbers = more important)
        5. Keep descriptions concise but informative
        6. Include key terms that students should know for each concept
        7. Ensure the tree structure is logical and easy to follow
        8. If there are existing nodes, maintain consistency and avoid duplication
        9. Consider merging similar concepts or creating parent-child relationships with existing nodes

        The knowledge tree should serve as a clear learning roadmap for students.
        Start with the most fundamental concepts as root nodes, then build supporting concepts as children.
        Use the order field to prioritize concepts (1 = most important, higher numbers = less important).
        </instructions>

        <input_information>
        You will be given concepts from a chunk and optionally existing knowledge graph nodes for reference.
        </input_information>
        `,
        prompt: prompt,
        temperature: 0.3,
      });

      console.log(
        `AI analysis completed successfully for chunk ${chunkIndex}/${totalChunks}`,
      );
      return result.object;
    } catch (aiError) {
      retryCount++;
      console.error(
        `AI analysis attempt ${retryCount} failed for chunk ${chunkIndex}:`,
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
        `Retrying AI analysis in ${waitTime}ms for chunk ${chunkIndex}`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
};

export const generateKnowledgeGraph = internalAction({
  args: {
    courseId: v.id("courses"),
  },
  returns: v.object({
    success: v.boolean(),
    knowledgeGraph: v.optional(v.any()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { courseId }) => {
    try {
      console.log(
        `Starting knowledge graph generation for course: ${courseId}`,
      );

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
        `Found ${allConcepts.length} total concepts for course: ${courseId}`,
      );

      // Check if we need to split into chunks
      if (allConcepts.length <= CONCEPTS_PER_CHUNK) {
        console.log(
          `Concepts count (${allConcepts.length}) is small enough, processing as single chunk for course: ${courseId}`,
        );

        // Process as single chunk (original logic)
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
          schema: KnowledgeGraphSchema,
          system: `
          <role>
            You are an expert educational content analyzer that extracts key learning concepts and figure out the dependencies between them.
            Your task is to sort concepts into a hierarchy of dependencies (knowledge tree) that students should learn from each from the most important to the least important.
          </role>

            <instructions>
            1. Identify key concepts across all materials and organize them in a hierarchical tree structure
            2. Create nodes for each important learning concept from the processed metadata
            3. Use parent-child relationships to show concept dependencies and organization
            4. Order nodes by importance (lower order numbers = more important)
            5. Keep descriptions concise but informative
            6. Include key terms that students should know for each concept
            7. Ensure the tree structure is logical and easy to follow
            8. Combine related concepts from different files into unified nodes when appropriate

            The knowledge tree should serve as a clear learning roadmap for students.
            Start with the most fundamental concepts as root nodes, then build supporting concepts as children.
            Use the order field to prioritize concepts (1 = most important, higher numbers = less important).
            </instructions>

            <input_information>
            You will be given a JSON object that contains concepts and materials information.
            </input_information>
            `,
          prompt: `${materialsContent}`,
          temperature: 0.3,
        });

        // Save the knowledge graph to the course
        await ctx.runMutation(api.courses.updateCourseLearningData, {
          courseId,
          learningData: {
            knowledgeGraph: object,
          },
        });

        return {
          success: true,
          knowledgeGraph: object,
        };
      }

      // Split concepts into chunks for large courses
      console.log(
        `Concepts count (${allConcepts.length}) is large, splitting into chunks for course: ${courseId}`,
      );
      const chunks = splitConceptsIntoChunks(allConcepts, CONCEPTS_PER_CHUNK);
      console.log(`Split into ${chunks.length} chunks for course: ${courseId}`);

      // Process chunks sequentially to build knowledge graph incrementally
      let accumulatedNodes = [];
      const allChunkResults = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkIndex = i + 1;

        console.log(
          `Processing chunk ${chunkIndex}/${chunks.length} for course: ${courseId}`,
        );

        try {
          const result = await processConceptChunk(
            chunk,
            accumulatedNodes,
            chunkIndex,
            chunks.length,
            courseWithFiles.name || "Course",
          );

          if (result && result.nodes) {
            allChunkResults.push(result);
            // Add new nodes to accumulated nodes for next chunk reference
            accumulatedNodes = mergeKnowledgeGraphNodes([
              ...accumulatedNodes,
              ...result.nodes,
            ]);
            console.log(
              `Chunk ${chunkIndex} completed. Accumulated nodes: ${accumulatedNodes.length} for course: ${courseId}`,
            );
          }
        } catch (chunkError) {
          console.error(
            `Error processing chunk ${chunkIndex} for course ${courseId}:`,
            chunkError,
          );
          // Continue with next chunk instead of failing completely
          continue;
        }
      }

      const chunkResults = allChunkResults.filter((result) => result !== null);

      if (chunkResults.length === 0) {
        throw new Error("All chunks failed to process");
      }

      console.log(
        `Successfully processed ${chunkResults.length}/${chunks.length} chunks for course: ${courseId}`,
      );

      // Merge results from all chunks
      const allNodeArrays = chunkResults.map((r) => r.nodes);
      const finalNodes = mergeKnowledgeGraphNodes(allNodeArrays);

      const knowledgeGraph = {
        nodes: finalNodes,
        generatedAt: new Date().toISOString(),
        totalConcepts: allConcepts.length,
        chunksProcessed: chunkResults.length,
      };

      console.log(`Saving merged knowledge graph for course: ${courseId}`, {
        nodeCount: finalNodes.length,
        totalConcepts: allConcepts.length,
        chunksProcessed: chunkResults.length,
      });

      // Save the knowledge graph to the course
      await ctx.runMutation(api.courses.updateCourseLearningData, {
        courseId,
        learningData: {
          knowledgeGraph: knowledgeGraph,
        },
      });

      return {
        success: true,
        knowledgeGraph: knowledgeGraph,
      };
    } catch (error) {
      console.error("Error generating knowledge graph:", error);

      // Update status to failed
      try {
        await ctx.runMutation(api.courses.updateCourseLearningData, {
          courseId,
          learningData: {
            // No specific data to update on failure
          },
        });
      } catch (statusUpdateError) {
        console.error(
          "Failed to update knowledge graph status:",
          statusUpdateError,
        );
      }

      return {
        success: false,
        error: `Failed to generate knowledge graph: ${error.message}`,
      };
    }
  },
});

// Helper function to save knowledge graph to course
export const saveKnowledgeGraphToCourse = action({
  args: {
    courseId: v.id("courses"),
    knowledgeGraph: v.any(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { courseId, knowledgeGraph }) => {
    try {
      const course = await ctx.runQuery(api.courses.getCourse, {
        courseId,
      });
      if (!course) {
        return { success: false, error: "Course not found" };
      }

      // Get current learning data or initialize it
      const currentLearningData = course.learningData || {};

      // Save knowledge graph to learningData
      await ctx.runMutation(api.courses.updateCourseLearningData, {
        courseId,
        learningData: {
          knowledgeGraph: {
            ...knowledgeGraph,
            savedAt: new Date().toISOString(),
          },
        },
      });

      return { success: true };
    } catch (error) {
      console.error("Error saving knowledge graph:", error);
      return {
        success: false,
        error: `Failed to save knowledge graph: ${error.message}`,
      };
    }
  },
});

// Note: The main generateKnowledgeGraph function now takes a courseId directly,
// so this helper function is no longer needed. Use generateKnowledgeGraph directly.

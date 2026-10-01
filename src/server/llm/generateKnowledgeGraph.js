import { generateObject } from "ai";
import { logError } from "../log.js";
import { z } from "zod";
import { getModel } from "./providers.js";
import { getCourseWithFiles, mergeLearningData } from "../db.js";

// The schema allows the model to omit optional fields; consumers must never
// see them missing. Every node leaves here with keyTerms/children arrays.
function normalizeGraph(graph) {
  return {
    ...graph,
    nodes: (graph?.nodes ?? []).map((node) => ({
      ...node,
      keyTerms: Array.isArray(node.keyTerms) ? node.keyTerms : [],
      children: Array.isArray(node.children) ? node.children : [],
      parent: node.parent ?? null,
    })),
  };
}

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

const CONCEPTS_PER_CHUNK = 80;

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

const mergeKnowledgeGraphNodes = (nodeArrays) => {
  const allNodes = nodeArrays.flat();
  const mergedNodes = [];
  const seenIds = new Set();

  for (const node of allNodes) {
    if (!seenIds.has(node.id)) {
      seenIds.add(node.id);
      mergedNodes.push(node);
    }
  }

  mergedNodes.sort((a, b) => a.order - b.order);
  return mergedNodes;
};

const chunkSystemPrompt = `
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
        `;

const singleShotSystemPrompt = `
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
            `;

const processConceptChunk = async (chunk, existingNodes, chunkIndex, totalChunks, courseName) => {
  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    try {
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
        model: getModel(),
        schema: KnowledgeGraphSchema,
        system: chunkSystemPrompt,
        prompt,
        temperature: 0.3,
      });

      return normalizeGraph(result.object);
    } catch (aiError) {
      retryCount++;
      logError("llm", aiError, { where: `AI analysis attempt ${retryCount} failed for chunk ${chunkIndex}:` });

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

export async function generateKnowledgeGraph(courseId) {
  try {
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
        schema: KnowledgeGraphSchema,
        system: singleShotSystemPrompt,
        prompt: `${materialsContent}`,
        temperature: 0.3,
      });

      const graph = normalizeGraph(object);
      mergeLearningData(courseId, { knowledgeGraph: graph });
      return { success: true, knowledgeGraph: graph };
    }

    const chunks = splitConceptsIntoChunks(allConcepts, CONCEPTS_PER_CHUNK);
    let accumulatedNodes = [];
    const allChunkResults = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkIndex = i + 1;
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
          accumulatedNodes = mergeKnowledgeGraphNodes([
            ...accumulatedNodes,
            ...result.nodes,
          ]);
        }
      } catch (chunkError) {
        logError("llm", chunkError, { where: `Error processing chunk ${chunkIndex} for course ${courseId}:` });
        continue;
      }
    }

    const chunkResults = allChunkResults.filter((result) => result !== null);
    if (chunkResults.length === 0) {
      throw new Error("All chunks failed to process");
    }

    const finalNodes = mergeKnowledgeGraphNodes(
      chunkResults.map((r) => r.nodes),
    );

    const knowledgeGraph = {
      nodes: finalNodes,
      generatedAt: new Date().toISOString(),
      totalConcepts: allConcepts.length,
      chunksProcessed: chunkResults.length,
    };

    mergeLearningData(courseId, { knowledgeGraph });
    return { success: true, knowledgeGraph };
  } catch (error) {
    logError("llm", error, { where: "Error generating knowledge graph:" });
    return {
      success: false,
      error: `Failed to generate knowledge graph: ${error.message}`,
    };
  }
}

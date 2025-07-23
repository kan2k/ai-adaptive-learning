import { internalAction, query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

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

const conceptSchema = {
  type: "object",
  properties: {
    fileName: {
      type: "string",
      description: "The name of the PDF file being analyzed",
    },
    fileMetadata: {
      type: "object",
      description: "Metadata about the file content",
      properties: {
        relatedArea: {
          type: "string",
          description:
            "The subject area, field of study, or domain this file relates to (e.g., 'Computer Science', 'Biology', 'Business Management')",
        },
        author: {
          type: "string",
          description:
            "Author name(s) or organization that created this content. Use 'Unknown' if not found.",
        },
        description: {
          type: "string",
          description:
            "A direct, engaging description that immediately tells what the content is about. NEVER start with meta-phrases like: 'This document', 'This paper', 'This module', 'This guide', 'This study', 'This content provides', 'This resource covers', etc. Instead, start directly with the actual topic. For example, instead of 'This document provides an introduction to electrical components', write 'Fundamental electrical components including resistors, capacitors, and...'",
        },
      },
      required: ["relatedArea", "author", "description"],
    },
    concepts: {
      type: "array",
      description: "Array of distinct concepts extracted from this file",
      items: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Clear, concise title of the concept",
          },
          reference: {
            type: "string",
            description: "Direct quote or reference from the source material",
          },
          summary: {
            type: "string",
            description:
              "Comprehensive explanation of the concept for student learning",
          },
        },
        required: ["title", "reference", "summary"],
      },
    },
  },
  required: ["fileName", "fileMetadata", "concepts"],
};

// Helper function to call OpenRouter API directly
async function callOpenRouterAPI(messages, fileName) {
  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: messages,
          temperature: 0.3,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "concept_extraction",
              schema: conceptSchema,
            },
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter API error: ${response.status} - ${errorText}`,
      );
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error("No response from OpenRouter API");
    }

    const content = data.choices[0].message.content;
    const annotations = data.choices[0].message.annotations;

    // Parse the JSON response
    const parsedContent = JSON.parse(content);

    return {
      concepts: parsedContent,
      annotations: annotations,
    };
  } catch (error) {
    console.error(`Error calling OpenRouter API for ${fileName}:`, error);
    throw error;
  }
}

export const generateMetadata = internalAction({
  args: {
    courseId: v.id("courses"),
  },

  handler: async (ctx, args) => {
    console.log(`Starting learning generation for course: ${args.courseId}`);

    // Get the course and its files using the helper query from courses.js
    const courseData = await ctx.runQuery("courses:getCourseWithFiles", {
      courseId: args.courseId,
    });

    if (!courseData) {
      throw new Error("Course not found");
    }

    if (!courseData.files || courseData.files.length === 0) {
      throw new Error("No files found in this course");
    }

    console.log(
      `Found ${courseData.files.length} files in course: ${courseData.name}`,
    );

    const allConcepts = [];

    // Filter out files that already have generated concepts
    const filesToProcess = courseData.files.filter((file) => {
      const hasGeneratedConcepts = Boolean(
        file.metadata?.concepts && file.metadata.concepts.length > 0,
      );
      if (hasGeneratedConcepts) {
        console.log(`Skipping ${file.name} - already has generated concepts`);
        return false;
      }
      return true;
    });

    if (filesToProcess.length === 0) {
      console.log("All files in this course already have generated concepts");
      return {
        courseId: args.courseId,
        courseName: courseData.name,
        totalFilesProcessed: 0,
        concepts: [],
        message: "All files already have generated concepts",
      };
    }

    console.log(
      `Found ${filesToProcess.length} files to process (${courseData.files.length - filesToProcess.length} already have concepts)`,
    );

    // Process each file individually
    for (const file of filesToProcess) {
      try {
        console.log(`Processing file: ${file.name}`);

        // Get the file URL from Convex storage using helper query from files.js
        const fileUrl = await ctx.runQuery("files:getFileUrl", {
          storageId: file.storageId,
        });

        if (!fileUrl) {
          console.warn(`Could not get URL for file ${file.name}, skipping...`);
          continue;
        }

        // Convert PDF to base64 using Node.js environment
        const pdfResult = await ctx.runAction(
          internal.llm.pdfProcessor.processPDFFile,
          {
            fileUrl: fileUrl,
            fileName: file.name,
            systemPrompt: getSystemPrompt(),
          },
        );

        if (pdfResult.success) {
          // Call OpenRouter API with the base64 PDF
          const apiResult = await callOpenRouterAPI(
            pdfResult.messages,
            file.name,
          );

          console.log(
            `Successfully extracted ${apiResult.concepts.concepts.length} concepts from ${file.name}`,
          );

          // Save concepts and metadata to the file in the database
          await ctx.runMutation("files:saveConcepts", {
            fileId: file._id,
            concepts: apiResult.concepts.concepts,
            fileMetadata: apiResult.concepts.fileMetadata,
            annotations: apiResult.annotations,
          });

          console.log(`Saved concepts to database for ${file.name}`);
          allConcepts.push(apiResult.concepts);
        } else {
          console.error(`Failed to process ${file.name}: ${pdfResult.error}`);
          // Continue with other files even if one fails
        }
      } catch (error) {
        console.error(`Error processing file ${file._id}:`, error);
        // Continue with other files even if one fails
      }
    }

    console.log(
      `Learning generation completed. Total files processed: ${allConcepts.length}`,
    );
    console.log("Generated concepts:", JSON.stringify(allConcepts, null, 2));

    return {
      courseId: args.courseId,
      courseName: courseData.name,
      totalFilesProcessed: allConcepts.length,
      concepts: allConcepts,
    };
  },
});

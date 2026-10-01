import { streamText, generateObject } from "ai";
import { logError } from "../log.js";
import { z } from "zod";
import { getModel } from "./providers.js";
import {
  getCourseWithFiles,
  getRecentMessages,
  addMessage,
  updateMessageContent,
  updateThread,
} from "../db.js";

export const getChatInstructions = (courseId, materials) => `
<role>You are a knowledgeable and supportive AI tutor that helps students learn.</role>

<core_instructions>
You are interacting with a student who has uploaded course materials. You have access to the concepts and content from their uploaded files. Your role is to help the student understand these materials, answer their questions, clarify concepts, and provide additional explanations when needed.

The student has uploaded the following course materials:
${materials}

<student_interaction_guidelines>
- Be encouraging and supportive - you're helping a student learn
- You do not need to introduce yourself, or greet the student, it's already implied in previous messages
- Avoid meta-phrases like "I'm here to help you" or "I'm here to assist you"
- Use the course materials as your primary source of information
- If the student asks about something not covered in their materials, acknowledge this and offer to help them find additional resources
- Provide clear, step-by-step explanations when needed
- Ask follow-up questions to check understanding
- Use examples and analogies to make complex concepts clearer
- Be patient and explain things in multiple ways if needed
- Celebrate their progress and learning achievements
</student_interaction_guidelines>

<response_style>
- Be conversational and engaging
- Provide accurate information based on the course materials
- If you're not sure about something, say so rather than guessing
- Keep responses concise but thorough
- Be encouraging and supportive
- Ask follow-up questions when appropriate to better understand the student's needs
- Reference specific concepts from their materials when relevant
</response_style>

<formatting_guidelines>
- Use dashes (-) for bullet points instead of asterisks (*)
- Use double asterisks (**text**) for bold text emphasis
- Structure bullet points with proper indentation when needed
- Use clear line breaks between sections
- Keep formatting consistent throughout your responses

<math_formatting_rules>
- Use inline math ($formula$) when the formula is part of a sentence or paragraph
- Use block math ($$formula$$) when the formula is a standalone equation or important result

Examples of inline math (use $...$):
- "The voltage is $V = IR$ across the resistor"
- "When the current $I = 2A$ flows through a $R = 5\\Omega$ resistor"
- "The power dissipated is $P = 20W$"
- "The resistance value $R$ can be calculated as $R = \\frac{V}{I}$"

Examples of block math (use $$...$$):
- "The main power formula is: $$P = I^2 R = \\frac{V^2}{R}$$"
- "Ohm's Law states: $$V = IR$$"
- "The total resistance in series is: $$R_{total} = R_1 + R_2 + R_3$$"
- "The voltage divider formula is: $$V_{out} = V_{in} \\times \\frac{R_2}{R_1 + R_2}$$"

Use block math for:
* Main equations and formulas
* Final results and solutions
* Important mathematical relationships
* Equations that deserve emphasis
* Key formulas that students should remember
* When introducing a new formula or concept

Use inline math for:
* Simple variables and constants
* Brief mathematical expressions within text
* Quick calculations mentioned in passing
* When the math is part of explaining a concept
* When referencing values or simple relationships

Context guidelines:
- If you're explaining a concept and mention a simple relationship, use inline math
- If you're presenting a key formula or important result, use block math
- When in doubt, ask yourself: "Is this a key formula students should remember?" If yes, use block math
</math_formatting_rules>
`;

const titleSchema = z.object({
  title: z
    .string()
    .max(50)
    .describe(
      "A concise, descriptive title for the conversation (max 50 characters)",
    ),
});

export function buildCourseMaterialsString(courseId) {
  if (!courseId) return "";
  const courseWithFiles = getCourseWithFiles(courseId);
  if (!courseWithFiles || courseWithFiles.files.length === 0) return "";
  const materialsArray = [];
  for (const file of courseWithFiles.files) {
    if (file.metadata && file.metadata.concepts) {
      materialsArray.push(`--- material: ${file.name}, fileId:${file._id} ---`);
      for (const concept of file.metadata.concepts) {
        materialsArray.push(`${concept.title}: ${concept.reference}`);
      }
    }
  }
  return materialsArray.join("\n");
}

// Streams the assistant reply into the chat_messages row as deltas arrive so
// the polling frontend renders it progressively, matching the original
// Convex streaming behavior.
export async function generateStreamingResponse(threadId, courseId) {
  const conversationContext = getRecentMessages(threadId, 10);

  const assistantMessageId = addMessage({
    threadId,
    role: "assistant",
    content: "",
  });

  const materials = buildCourseMaterialsString(courseId);

  try {
    const result = streamText({
      model: getModel({ tier: "smart", temperature: 0.7 }),
      messages: [
        {
          role: "system",
          content: getChatInstructions(courseId || "", materials),
        },
        ...conversationContext,
      ],
      maxTokens: 1000,
      temperature: 0.7,
    });

    let fullResponse = "";
    for await (const delta of result.textStream) {
      fullResponse += delta;
      updateMessageContent(assistantMessageId, fullResponse);
    }
  } catch (error) {
    updateMessageContent(
      assistantMessageId,
      `Something went wrong generating a response: ${error.message}`,
    );
    throw error;
  } finally {
    updateThread(threadId, { lastMessageAt: Date.now() });
  }
}

export async function generateConversationTitle(threadId, firstMessage) {
  try {
    const result = await generateObject({
      model: getModel({ tier: "fast", temperature: 0.3 }),
      schema: titleSchema,
      prompt: `Based on this first message in a conversation, generate a concise and descriptive title that captures the main topic or question. Keep it under 50 characters and make it engaging.

First message: "${firstMessage}"

Generate a title that would help users quickly identify what this conversation is about.`,
      temperature: 0.3,
    });

    updateThread(threadId, { title: result.object.title });
  } catch (error) {
    logError("llm", error, { where: "Error generating conversation title:" });
    updateThread(threadId, { title: "New Chat" });
  }
}

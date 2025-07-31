import {
  mutation,
  action,
  internalAction,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { Agent } from "@convex-dev/agent";
import { internal, api, components } from "./_generated/api";
import { openai, openrouter } from "./llm/providers";
import { streamText, generateObject } from "ai";
import { z } from "zod";

const getChatInstructions = (courseId, materials) => `
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
- "When the current $I = 2A$ flows through a $R = 5\Omega$ resistor"
- "The power dissipated is $P = 20W$"
- "The resistance value $R$ can be calculated as $R = \frac{V}{I}$"

Examples of block math (use $$...$$):
- "The main power formula is: $$P = I^2 R = \frac{V^2}{R}$$"
- "Ohm's Law states: $$V = IR$$"
- "The total resistance in series is: $$R_{total} = R_1 + R_2 + R_3$$"
- "The voltage divider formula is: $$V_{out} = V_{in} \times \frac{R_2}{R_1 + R_2}$$"

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

const getChatAgent = (courseId, materials) => {
  const chatAgent = new Agent(components.agent, {
    chat: openrouter("google/gemini-2.5-flash", {
      extraBody: {
        temperature: 0.7,
      },
    }),
    maxSteps: 10,
    maxRetries: 2,
    instructions: getChatInstructions(courseId, materials),
    contextOptions: {
      recentMessages: 50,
      searchOptions: {
        limit: 10,
        textSearch: false,
        vectorSearch: false,
        messageRange: { before: 2, after: 1 },
      },
      searchOtherThreads: false,
    },
  });

  return chatAgent;
};

/**
 * Get all chat threads for a user
 */
export const getChatThreads = query({
  args: {
    userId: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id("chatThreads"),
      _creationTime: v.number(),
      userId: v.string(),
      courseId: v.optional(v.id("courses")),
      title: v.optional(v.string()),
      threadId: v.string(),
      createdAt: v.number(),
      lastMessageAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const threads = await ctx.db
      .query("chatThreads")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    // Sort by lastMessageAt (most recent first), then by createdAt
    return threads.sort((a, b) => {
      const aLastMessage = a.lastMessageAt || a.createdAt;
      const bLastMessage = b.lastMessageAt || b.createdAt;
      return bLastMessage - aLastMessage;
    });
  },
});

/**
 * Get messages for a specific thread
 */
export const getChatMessages = query({
  args: {
    threadId: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id("chatMessages"),
      _creationTime: v.number(),
      threadId: v.string(),
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();

    return messages;
  },
});

/**
 * Create a new chat thread
 */
export const createChatThread = action({
  args: {
    userId: v.string(),
    courseId: v.id("courses"),
    title: v.optional(v.string()),
  },
  returns: v.object({
    threadId: v.string(),
    chatThreadId: v.id("chatThreads"),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get course with files and materials
    const courseWithFiles = await ctx.runQuery(api.courses.getCourseWithFiles, {
      courseId: args.courseId,
    });
    if (!courseWithFiles) throw new Error("Course not found");
    if (courseWithFiles.files.length === 0)
      throw new Error("No files found in course");

    // Extract materials from course files
    const materials = [];
    for (const file of courseWithFiles.files) {
      if (file.metadata && file.metadata.concepts) {
        materials.push(`--- material: ${file.name}, fileId:${file._id} ---`);
        for (const concept of file.metadata.concepts) {
          materials.push(`${concept.title}: ${concept.reference}`);
        }
      }
    }

    const chatAgent = getChatAgent(args.courseId, materials);
    const { thread } = await chatAgent.createThread(ctx, {
      userId: args.userId,
    });

    // Create the chat thread record
    const chatThreadId = await ctx.runMutation(
      internal.chat.internalCreateChatThread,
      {
        userId: args.userId,
        courseId: args.courseId,
        threadId: thread.threadId,
        title: args.title,
      },
    );

    // Create a list of material files for the initial message
    const materialFilesList = courseWithFiles.files
      .filter((file) => file.metadata && file.metadata.concepts)
      .map((file) => `- ${file.name}`)
      .join("\n");

    // Add initial assistant message
    const initialMessageId = await ctx.runMutation(
      internal.chat.internalAddMessage,
      {
        threadId: thread.threadId,
        role: "assistant",
        content: `Hello! I'm here to help you with your course materials for **${courseWithFiles.name}**.

I can see you've uploaded the following material files:
${materialFilesList}

What would you like to know about? Feel free to ask me anything about the topics in your materials!`,
      },
    );

    return {
      threadId: thread.threadId,
      chatThreadId,
    };
  },
});

/**
 * Send a message to a chat thread
 */
export const sendMessage = action({
  args: {
    threadId: v.string(),
    content: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get the chat thread to find the courseId
    const chatThread = await ctx.runQuery(internal.chat.internalGetChatThread, {
      threadId: args.threadId,
    });
    if (!chatThread) throw new Error("Chat thread not found");

    // Check if this is the first user message (after the initial assistant message)
    const existingMessages = await ctx.runQuery(
      internal.chat.internalGetRecentMessages,
      {
        threadId: args.threadId,
        limit: 10,
      },
    );

    const isFirstUserMessage =
      existingMessages.length === 1 && existingMessages[0].role === "assistant";

    // Add user message to database
    const userMessageId = await ctx.runMutation(
      internal.chat.internalAddMessage,
      {
        threadId: args.threadId,
        role: "user",
        content: args.content,
      },
    );

    // Update thread's last message timestamp
    await ctx.runMutation(internal.chat.internalUpdateThreadLastMessage, {
      threadId: args.threadId,
    });

    // Generate conversation title if this is the first user message
    if (isFirstUserMessage) {
      await ctx.scheduler.runAfter(
        0,
        internal.chat.internalGenerateConversationTitle,
        {
          threadId: args.threadId,
          firstMessage: args.content,
        },
      );
    }

    // Generate AI response using streaming with course context
    await ctx.scheduler.runAfter(
      0,
      internal.chat.internalGenerateStreamingResponse,
      {
        threadId: args.threadId,
        courseId: chatThread.courseId,
      },
    );

    return {
      success: true,
      message: "Message sent and AI response scheduled",
    };
  },
});

/**
 * Delete a chat thread
 */
export const deleteChatThread = mutation({
  args: {
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Delete all messages in the thread
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    // Delete the thread
    const thread = await ctx.db
      .query("chatThreads")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .unique();

    if (thread) {
      await ctx.db.delete(thread._id);
    }

    return null;
  },
});

/**
 * Update thread title
 */
export const updateThreadTitle = mutation({
  args: {
    threadId: v.string(),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("chatThreads")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .unique();

    if (thread) {
      await ctx.db.patch(thread._id, { title: args.title });
    }

    return null;
  },
});

// Internal functions

export const internalCreateChatThread = internalMutation({
  args: {
    userId: v.string(),
    courseId: v.optional(v.id("courses")),
    threadId: v.string(),
    title: v.optional(v.string()),
  },
  returns: v.id("chatThreads"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("chatThreads", {
      userId: args.userId,
      courseId: args.courseId,
      threadId: args.threadId,
      title: args.title,
      createdAt: Date.now(),
      lastMessageAt: Date.now(),
    });
  },
});

export const internalAddMessage = internalMutation({
  args: {
    threadId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  },
  returns: v.id("chatMessages"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("chatMessages", {
      threadId: args.threadId,
      role: args.role,
      content: args.content,
      createdAt: Date.now(),
    });
  },
});

export const internalUpdateThreadLastMessage = internalMutation({
  args: {
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("chatThreads")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .unique();

    if (thread) {
      await ctx.db.patch(thread._id, { lastMessageAt: Date.now() });
    }

    return null;
  },
});

export const internalGenerateResponse = internalAction({
  args: {
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const chatAgent = getChatAgent();
    const { thread } = await chatAgent.continueThread(ctx, {
      threadId: args.threadId,
    });

    // Get recent messages for context
    const messages = await ctx.runQuery(
      internal.chat.internalGetRecentMessages,
      {
        threadId: args.threadId,
        limit: 10,
      },
    );

    // Create conversation context
    const conversationContext = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Generate AI response
    const { text } = await thread.generateText({
      prompt:
        "Please respond to the user's message in a helpful and engaging way.",
      onStepFinish: async ({ text, toolCalls, toolResults, finishReason }) => {
        console.log(
          "[Chat Step Finish]",
          finishReason,
          text,
          toolCalls,
          toolResults,
        );
      },
    });

    // Add AI response to database
    await ctx.runMutation(internal.chat.internalAddMessage, {
      threadId: args.threadId,
      role: "assistant",
      content: text,
    });

    // Update thread's last message timestamp
    await ctx.runMutation(internal.chat.internalUpdateThreadLastMessage, {
      threadId: args.threadId,
    });

    return null;
  },
});

export const internalGenerateStreamingResponse = internalAction({
  args: {
    threadId: v.string(),
    courseId: v.optional(v.id("courses")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get recent messages for context
    const messages = await ctx.runQuery(
      internal.chat.internalGetRecentMessages,
      {
        threadId: args.threadId,
        limit: 10,
      },
    );

    // Create conversation context
    const conversationContext = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Create initial assistant message
    const assistantMessageId = await ctx.runMutation(
      internal.chat.internalAddMessage,
      {
        threadId: args.threadId,
        role: "assistant",
        content: "",
      },
    );

    // Get course materials if courseId is provided
    let materials = "";
    if (args.courseId) {
      const courseWithFiles = await ctx.runQuery(
        api.courses.getCourseWithFiles,
        {
          courseId: args.courseId,
        },
      );
      if (courseWithFiles && courseWithFiles.files.length > 0) {
        const materialsArray = [];
        for (const file of courseWithFiles.files) {
          if (file.metadata && file.metadata.concepts) {
            materialsArray.push(
              `--- material: ${file.name}, fileId:${file._id} ---`,
            );
            for (const concept of file.metadata.concepts) {
              materialsArray.push(`${concept.title}: ${concept.reference}`);
            }
          }
        }
        materials = materialsArray.join("\n");
      }
    }

    // Use streamText with course context
    const result = await streamText({
      model: openrouter("google/gemini-2.5-flash", {
        extraBody: {
          temperature: 0.7,
        },
      }),
      messages: [
        {
          role: "system",
          content: getChatInstructions(args.courseId || "", materials),
        },
        ...conversationContext,
      ],
      maxTokens: 1000,
    });

    let fullResponse = "";

    // Stream the response and update the assistant message
    for await (const delta of result.textStream) {
      fullResponse += delta;

      // Update the assistant message in real-time
      await ctx.runMutation(internal.chat.internalUpdateMessageContent, {
        messageId: assistantMessageId,
        content: fullResponse,
      });
    }

    // Update thread's last message timestamp
    await ctx.runMutation(internal.chat.internalUpdateThreadLastMessage, {
      threadId: args.threadId,
    });

    return null;
  },
});

export const internalGenerateConversationTitle = internalAction({
  args: {
    threadId: v.string(),
    firstMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      // Generate a conversation title using generateObject with Zod schema
      const result = await generateObject({
        model: openrouter("google/gemini-2.5-flash", {
          extraBody: {
            temperature: 0.3,
          },
        }),
        schema: titleSchema,
        prompt: `Based on this first message in a conversation, generate a concise and descriptive title that captures the main topic or question. Keep it under 50 characters and make it engaging.

First message: "${args.firstMessage}"

Generate a title that would help users quickly identify what this conversation is about.`,
      });

      // Update the thread title
      await ctx.runMutation(internal.chat.internalUpdateThreadTitle, {
        threadId: args.threadId,
        title: result.object.title,
      });

      console.log("Generated conversation title:", result.object.title);
    } catch (error) {
      console.error("Error generating conversation title:", error);
      // Fallback to a simple title
      await ctx.runMutation(internal.chat.internalUpdateThreadTitle, {
        threadId: args.threadId,
        title: "New Chat",
      });
    }

    return null;
  },
});

export const internalUpdateMessageContent = internalMutation({
  args: {
    messageId: v.id("chatMessages"),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { content: args.content });
    return null;
  },
});

export const internalGetChatThread = internalQuery({
  args: {
    threadId: v.string(),
  },
  returns: v.optional(
    v.object({
      _id: v.id("chatThreads"),
      _creationTime: v.number(),
      userId: v.string(),
      courseId: v.optional(v.id("courses")),
      title: v.optional(v.string()),
      threadId: v.string(),
      createdAt: v.number(),
      lastMessageAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chatThreads")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .unique();
  },
});

export const internalUpdateThreadTitle = internalMutation({
  args: {
    threadId: v.string(),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("chatThreads")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .unique();

    if (thread) {
      await ctx.db.patch(thread._id, { title: args.title });
    }

    return null;
  },
});

export const internalGetRecentMessages = internalQuery({
  args: {
    threadId: v.string(),
    limit: v.number(),
  },
  returns: v.array(
    v.object({
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(args.limit);

    // Reverse to get chronological order
    return messages.reverse().map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  },
});

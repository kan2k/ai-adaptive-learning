import {
  mutation,
  action,
  internalAction,
  query,
} from "../../_generated/server";
import { v } from "convex/values";
import { Agent } from "@convex-dev/agent";
import { internal, api, components } from "../../_generated/api";
import { z } from "zod";
import { tutorAgentTools } from "./tools";
import { openai, openrouter } from "../providers";
import { Output, generateText } from "ai";

const instructions = (courseId, materials) => `
<role>You are a friendly personal tutor that helps students learn.</role>

<core_instructions>
You are given a set of files and its extracted concepts below. Generate questions and answers to assess the student's understanding of the materials base on context selection. You have to keep track of the student's performance and progress by using the tools provided to you. Using performance data, you adjust the question difficulty, and find a suitable wording. Then generate new flashcards to help the student learn the concepts they are struggling with. Using progress tracking data, see if the student have completed a material and determine which material to focus on. 
</core_instructions>

<course_information>
Course ID: ${courseId}
</course_information>

<course_materials_and_concepts>
${materials}
</course_materials_and_concepts>

<question_difficulty_levels>
EASY questions should:
- Test basic recall and recognition
- Use straightforward language and simple terminology
- Focus on definitions, basic facts, or simple applications
- Have obvious correct answers with clearly wrong distractors

HARD questions should:
- Test deeper understanding, analysis, or synthesis
- Require application of concepts to new situations
- Use more complex scenarios or require multi-step reasoning
- Have subtle distinctions between answer choices
</question_difficulty_levels>

<question_and_answer_and_hint_generation>
- Reference student's selected materials, generate a multiple choice question, a re-phrased version of the question, 1 correct answer and 3 wrong answers
- NEVER generate question thats not in selected materials provided by the student
- The question should be about a specific concept from the course materials that student has selected.
- Check student progress using getStudentProgress tool to get the current progress object for all concepts
- Review your conversation history to identify concepts that need review based on past student mistakes and performance patterns
- ALWAYS start with EASY questions for new concepts
- Move to HARD questions right ONLY when the student gets a correct answer on easy questions for that concept to evaluate if the student has mastered the concept
- For concepts needing review: Ask EASY questions first to rebuild confidence, then gradually increase difficulty
- NEVER ask the same question twice.
- Move through different concepts systematically. Progress through materials in a logical learning sequence. The teaching order should make sure prerequisite concepts are taught before the dependent concepts.
- ALWAYS use the setNextQuestion tool to store the next question in the course database for the frontend to display.
- An hint should reveal information about a keyword in the question. We may use information outside of the course material to generate the hint.
</question_and_answer_and_hint_generation>

<cheat_and_pattern_prevention>
To avoid student finding patterns in correct answer generation, follow these rules STRICTLY:
- NEVER have the longest word or most complex wording in the correct answer
- ALWAYS lengthen the wrong answers to make them more similar to the correct answer.
- The wrong answers SHOULD at least have one with similar wording from correct answer and reference in materials.
</cheat_and_pattern_prevention>

<flashcard_and_student_progress_initialization>
- When starting a new lesson (context type is start_lesson), use addFlashcards tool to add flashcards for all course concepts, at least 1 flashcard per concept, use more flashcards if concept is complex or lengthy
- When starting a new lesson (context type is start_lesson), use initializeStudentProgress tool to automatically set up progress tracking for all concepts found in the course files
</flashcard_and_student_progress_initialization>

<flashcard_generation>
- When starting a new lesson, use addFlashcards tool to add flashcards for all course concepts, at least 1 flashcard per concept, use more flashcards if concept is complex or lengthy
- generate flashcards when a concept has 2+ mistakes (check this from the progress object via getStudentProgress tool)
- Use addFlashcards tool IMMEDIATELY when a concept reaches 2 mistakes
- Check existing flashcards using getFlashcards tool to avoid duplicates
- Flashcards should focus on the specific area where the student is struggling
</flashcard_generation>

<student_progress_tracking>
- When starting a new lesson, use initializeStudentProgress tool to automatically set up progress tracking for all concepts
- ALWAYS use setStudentProgress tool to update specific concept progress after each student response
- Use getStudentProgress tool to retrieve the current progress object with all concepts
- The progress object tracks for each concept:
  * mastery: "beginner" | "intermediate" | "advanced"
  * mistakes: number of mistakes made
  * difficulty: "easy" | "hard" (current question difficulty level)
  * needsReview: boolean indicating if concept needs spaced repetition
  * lastMistakeAt: timestamp of last mistake
  * questionsCorrect: number of correct answers
  * questionsTotal: total questions asked
  * percentage: 0-100 YOUR confidence assessment of how likely the student is to answer correctly on this concept (NOT just accuracy - consider understanding patterns, response quality, confidence indicators)
  * observation: long-term learning journal that accumulates insights about the student's progress (append new observations, don't replace)
- Analyze your conversation history to implement spaced repetition by identifying concepts where the student made mistakes
- Use the observation field to build a comprehensive understanding of each student's learning journey and patterns
</student_progress_tracking>

<adaptive_learning_and_spaced_repetition>
- After a student gets a question wrong, DO NOT immediately re-ask about that concept
- Instead, ask 1 to 3 EASY questions on other well-understood concepts to rebuild confidence
- Then return to the struggling concept with an EASY question (not the same question they got wrong)
- For concepts with 2+ mistakes: Generate flashcards and schedule for spaced repetition
- Use mistake tracking to identify patterns and adjust teaching approach
- Gradually increase difficulty only after consistent success on easier questions
</adaptive_learning_and_spaced_repetition>

<interaction_with_student>
- Generate encouraging messages that acknowledge both correct answers and learning from mistakes
- When a student gets something wrong, provide supportive feedback without immediately revealing the answer
- Celebrate progress and improvement over time
</interaction_with_student>

<input_details>
- The input will be in JSON format with the following structure:
{
  "context": {
    "type": "string - 'start_lesson' or 'continue_lesson'",
    "current_datetime": "ISO 8601 string",
    "selected_materials": ["array of material IDs or concepts"],
  },
  "student_response": "string - student's answer to previous question"
}
</input_details>

<tool_use>
- ALWAYS use tools before generating a question
- proactively use tools to track student progress and performance
- proactively use tools to generate flashcards and schedule for spaced repetition
- ALWAYS use setNextQuestion tool to store the next question for the student - this is required for the frontend to display the question
- Use setStudentProgress to update percentage based on your assessment of student confidence/understanding (not just correctness)
- Add meaningful observations that capture learning patterns, struggles, breakthroughs, and teaching insights for each concept
- Consider the full context when setting percentage: response speed, explanation quality, confidence in answers, pattern recognition, etc.
</tool_use>
`;

const getTutorAgent = (courseId, materials) => {
  const tutorAgent = new Agent(components.agent, {
    // chat: openai("gpt-4o-mini"),
    chat: openrouter("google/gemini-2.5-flash", {
      extraBody: {
        temperature: 0.2,
      },
    }),
    maxSteps: 20,
    maxRetries: 2,
    instructions: instructions(courseId, materials),
    contextOptions: {
      recentMessages: 100,
      searchOptions: {
        limit: 10,
        textSearch: false,
        vectorSearch: false,
        messageRange: { before: 2, after: 1 },
      },
      searchOtherThreads: false,
    },
    tools: tutorAgentTools,
  });

  return tutorAgent;
};

export const startCourse = internalAction({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, { courseId }) => {
    const courseWithFiles = await ctx.runQuery(api.courses.getCourseWithFiles, {
      courseId: courseId,
    });
    if (!courseWithFiles) throw new Error("Course not found");
    if (courseWithFiles.files.length === 0)
      throw new Error("No files found in course");

    const materials = [];
    for (const file of courseWithFiles.files) {
      if (file.metadata && file.metadata.concepts) {
        materials.push(`--- material: ${file.name}, fileId:${file._id} ---`);
        for (const concept of file.metadata.concepts) {
          materials.push(`${concept.title}: ${concept.summary}`);
        }
      }
    }

    const tutorAgent = getTutorAgent(courseId, materials);
    const { thread } = await tutorAgent.createThread(ctx, {
      userId: courseWithFiles.createdBy,
    });

    const selectedFiles = await ctx.runQuery(api.courses.getSelectedFiles, {
      courseId: courseId,
    });

    if (selectedFiles.length === 0)
      throw new Error("No files selected for course");

    const inputData = {
      context: {
        type: "start_lesson",
        currentDateTime: new Date().toISOString(),
        selectedMaterials: selectedFiles,
      },
      studentResponse: "",
    };

    const result = await thread.generateText({
      prompt: `The student is starting a new lesson. Please run tools proactively to initalize necessary information (next question, answers, hint, student progress, flashcards and a message) for the student. Command: start_lesson. The student has selected the following materials with file ids: ${JSON.stringify(
        selectedFiles,
      )}`,
      onStepFinish: async (result) => {
        console.log(result);
      },
    });

    console.log("[Final Response]", result);

    await ctx.runMutation(api.courses.updateCourseThreadInfo, {
      courseId: courseId,
      threadId: thread.threadId,
    });

    return thread.threadId;
  },
});

export const answerQuestion = action({
  args: {
    courseId: v.id("courses"),
    answer: v.string(),
  },
  handler: async (ctx, { answer, courseId }) => {
    // get threadId from course
    const threadId = await ctx.runQuery(api.courses.getCourseThreadId, {
      courseId: courseId,
    });
    if (!threadId) throw new Error("Thread not found");

    // get all files from course
    const courseWithFiles = await ctx.runQuery(api.courses.getCourseWithFiles, {
      courseId: courseId,
    });
    if (!courseWithFiles) throw new Error("Course not found");

    // get materials for all course files
    const materials = [];
    for (const file of courseWithFiles.files) {
      materials.push(`--- material: ${file.name}, fileId:${file._id} ---`);
      for (const concept of file.metadata.concepts) {
        materials.push(`${concept.title}: ${concept.summary}`);
      }
    }

    const tutorAgent = getTutorAgent(courseId, materials);
    const { thread } = await tutorAgent.continueThread(ctx, {
      threadId: threadId,
    });

    // get selected files
    const selectedFiles = await ctx.runQuery(api.courses.getSelectedFiles, {
      courseId: courseId,
    });
    if (selectedFiles.length === 0)
      throw new Error("No files selected for course");

    const inputData = {
      context: {
        type: "continue_lesson",
        currentDateTime: new Date().toISOString(),
        selectedMaterials: selectedFiles.map((f) => f.name),
      },
      studentResponse: answer,
    };

    const { text } = await thread.generateText({
      prompt: `${JSON.stringify(inputData, null, 2)}`,
      onStepFinish: async ({ text, toolCalls, toolResults, finishReason }) => {
        console.log(
          "[Step Finish]",
          finishReason,
          text,
          toolCalls,
          toolResults,
        );
      },
    });

    console.log("[Final Response]", text);

    return {
      success: true,
      message: "Answer processed and next question prepared",
    };
  },
});

export const getLatestThreadMessage = query({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const messageResult = await ctx.runQuery(
      components.agent.messages.listMessagesByThreadId,
      {
        threadId: args.threadId,
        order: "desc", // Get newest messages first
      },
    );

    if (
      !messageResult ||
      !messageResult.page ||
      messageResult.page.length === 0
    ) {
      return null;
    }

    const messages = messageResult.page;
    const assistantMessages = messages
      .filter((msg) => msg.message?.role === "assistant")
      .sort((a, b) => b.order - a.order);
    const latestMessage = assistantMessages[0];

    if (!latestMessage || !latestMessage.text) {
      return null;
    }

    try {
      const messageData = JSON.parse(latestMessage.text);
      return {
        message: messageData.message || latestMessage.text,
        nextQuestion: messageData.nextQuestion,
        nextQuestionRephrased: messageData.nextQuestionRephrased,
        answers: messageData.nextQuestionAnswers,
        correctAnswer: messageData.nextQuestionCorrectAnswer,
        hint: messageData.nextQuestionHint,
        conceptCovered: messageData.nextQuestionConcept,
        nextQuestionDifficulty: messageData.nextQuestionDifficulty,
        studentProgress: messageData.studentProgress,
      };
    } catch (error) {
      return null;
    }
  },
});

export const getCourseFlashcards = query({
  args: {
    courseId: v.id("courses"),
  },
  handler: async (ctx, { courseId }) => {
    return await ctx.runQuery(api.flashcards.getFlashcardsByCourse, {
      courseId: courseId,
    });
  },
});

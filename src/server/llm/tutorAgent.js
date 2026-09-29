import { generateText, tool } from "ai";
import { z } from "zod";
import { getModel } from "./providers.js";
import {
  getCourseWithFiles,
  getSelectedFileIds,
  getSelectedFilesWithDetails,
  getPreferences,
  updateCourse,
  addMessage,
  getRecentMessages,
} from "../db.js";
import {
  buildMaterials,
  initializeStudentProgress,
  setStudentProgress,
  getStudentProgress,
  getAllConcepts,
  setNextQuestion,
  getFlashcardsByCourse,
  addFlashcards,
} from "../learning.js";
import { generateKnowledgeGraph } from "./generateKnowledgeGraph.js";
import { generateFlashcards } from "./generateFlashcards.js";

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

<question_style_guidelines>
You MUST tailor one of the questions you generate based on the student's learning preferences, which will be provided in the input.

Here are the definitions for each preference option:

**Language Complexity:**
- **Primary:** Use simple words, short sentences, and minimal jargon.
- **High School:** Use moderate vocabulary, compound sentences, and some subject-specific terms.
- **University:** Use academic language and subject-specific terminology.

**Analogy Usage:**
- **Frequent/Occasional:** Concepts should often be explained using relatable analogies or metaphors to aid understanding.
- **Limited:** Be direct and literal, focusing on definitions and formal logic rather than metaphor.

**Word Length:**
- **Short:** Use single-syllable or short words and brief sentences; prioritize clarity and readability.
- **Medium:** Use a mix of common and moderately long words; sentences should be concise but allow for depth.
- **Long:** Use subject-specific vocabulary; appropriate for advanced comprehension and precise meaning.
</question_style_guidelines>

<question_and_answer_and_hint_generation>
- For each turn, you will generate TWO versions of a multiple-choice question set based on a specific concept from the provided materials.
- Each set must include: the question, 1 correct answer, and 3 plausible incorrect answers.
- The two versions are:
  1.  **Original Question Set:** A standard, neutral question. Assume a high-school level of understanding with medium word length and occasional analogies. This serves as a baseline.
  2.  **Preference-Enhanced Question Set:** This version MUST be tailored to the student's \`user_preferences\` provided in the input. You must strictly follow the \`question_style_guidelines\`. You should also generate a re-phrased version of the question and a hint for this set.
- The final output of your turn must be a single JSON object containing both question sets and any other required information.
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

<flashcard_generation>
- generate flashcards when a concept has 2+ mistakes (check this from the progress object via getStudentProgress tool)
- Use addFlashcards tool IMMEDIATELY when a concept reaches 2 mistakes
- Check existing flashcards using getFlashcards tool to avoid duplicates
- Flashcards should focus on the specific area where the student is struggling
</flashcard_generation>

<student_progress_tracking>
- ALWAYS use setStudentProgress tool to update specific concept progress after each student answer a question, DO NOT call setStudentProgress when starting a new lesson (when context type is start_lesson)
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
    "user_preferences": {
        "languageComplexity": "string - 'Primary', 'High School', or 'University'",
        "analogyUsage": "string - 'Frequent', 'Occasional', or 'Limited'",
        "wordLength": "string - 'Short', 'Medium', or 'Long'"
    }
  },
  "student_response": "string - student's answer to previous question"
}
</input_details>

<output_format>
Your final response MUST be a single JSON object with the following structure:
{
  "message": "A friendly, encouraging message for the student.",
  "originalQuestion": {
    "question": "The baseline question text.",
    "answers": ["Array of 4 answer choices."],
    "correctAnswer": "The correct answer text."
  },
  "enhancedQuestion": {
    "question": "The preference-enhanced question text.",
    "questionRephrased": "A rephrased version of the enhanced question.",
    "answers": ["Array of 4 answer choices for the enhanced question."],
    "correctAnswer": "The correct answer for the enhanced question.",
    "hint": "A hint for the enhanced question.",
    "conceptCovered": "The concept this question is about.",
    "difficulty": "'EASY' or 'HARD'"
  },
  "studentProgress": { ... } // The student progress object.
}
</output_format>

<tool_use>
- ALWAYS use tools before generating a question
- proactively use tools to track student progress and performance
- proactively use tools to generate flashcards when concepts have 2+ mistakes and schedule for spaced repetition
- ALWAYS use setNextQuestion tool to store the next question for the student - this is required for the frontend to display the question
- Use setStudentProgress to update percentage based on your assessment of student confidence/understanding (not just correctness)
- Add meaningful observations that capture learning patterns, struggles, breakthroughs, and teaching insights for each concept
- Consider the full context when setting percentage: response speed, explanation quality, confidence in answers, pattern recognition, etc.
</tool_use>
`;

const tutorAgentTools = {
  getFlashcards: tool({
    description: "get all the flashcards",
    parameters: z.object({
      courseId: z.string().describe("The ID of the current course"),
    }),
    execute: async ({ courseId }) => getFlashcardsByCourse(courseId),
  }),
  addFlashcards: tool({
    description:
      "Add multiple flashcards at once for multiple concepts. Use this when starting a lesson or when multiple concepts need flashcards.",
    parameters: z.object({
      courseId: z.string().describe("The ID of the current course"),
      flashcards: z
        .array(
          z.object({
            conceptTitle: z
              .string()
              .describe("The concept this flashcard covers"),
            flashcardContent: z
              .string()
              .describe("The content of the flashcard"),
            flashcardImageDescription: z
              .string()
              .describe("The description of the flashcard image"),
          }),
        )
        .describe("Array of flashcards to create"),
    }),
    execute: async ({ courseId, flashcards }) => {
      const flashcardsToAdd = flashcards.map((flashcard) => ({
        conceptTitle: flashcard.conceptTitle,
        relatedArea: flashcard.conceptTitle,
        suggestionImage: flashcard.flashcardImageDescription,
        flashCardText: flashcard.flashcardContent,
        generationType: "pre-generated",
      }));
      addFlashcards(courseId, flashcardsToAdd);
      return {
        success: true,
        flashcardsAdded: flashcards.length,
        flashcards: flashcards.map((flashcard) => ({
          conceptTitle: flashcard.conceptTitle,
          status: "added",
          content: flashcard.flashcardContent,
        })),
      };
    },
  }),
  getStudentProgress: tool({
    description:
      "Get the student's current progress report as an object with concept names as keys and progress data as values",
    parameters: z.object({
      courseId: z.string().describe("The ID of the current course"),
    }),
    execute: async ({ courseId }) => getStudentProgress(courseId),
  }),
  setStudentProgress: tool({
    description:
      "Update the student's learning progress for a specific concept. This tracks mastery level, mistakes, difficulty progression, performance metrics, and long-term observations.",
    parameters: z.object({
      courseId: z.string().describe("The ID of the current course"),
      conceptKey: z
        .string()
        .describe("The concept name/key to update progress for"),
      updates: z
        .object({
          mastery: z
            .enum(["beginner", "intermediate", "advanced"])
            .optional()
            .describe("The student's mastery level for this concept"),
          mistakes: z
            .number()
            .optional()
            .describe("Number of mistakes made on this concept"),
          difficulty: z
            .enum(["easy", "hard"])
            .optional()
            .describe("Current difficulty level for questions on this concept"),
          needsReview: z
            .boolean()
            .optional()
            .describe("Whether this concept needs review/spaced repetition"),
          lastMistakeAt: z
            .number()
            .nullable()
            .optional()
            .describe("Timestamp of the last mistake on this concept"),
          questionsCorrect: z
            .number()
            .optional()
            .describe("Number of questions answered correctly"),
          questionsTotal: z
            .number()
            .optional()
            .describe("Total number of questions asked for this concept"),
          percentage: z
            .number()
            .min(0)
            .max(100)
            .optional()
            .describe(
              "Your confidence/assessment (0-100) of how likely the student is to answer correctly on this concept, based on their responses and understanding patterns",
            ),
          observation: z
            .string()
            .optional()
            .describe(
              "New observation about the student's learning for this concept. This will be appended to existing observations with a timestamp, creating a long-term learning journal. Use this to note patterns, breakthroughs, struggles, or insights.",
            ),
        })
        .describe("Object containing the progress updates to apply"),
    }),
    execute: async ({ courseId, conceptKey, updates }) =>
      setStudentProgress(courseId, conceptKey, updates),
  }),
  getAllConcepts: tool({
    description:
      "Get all concept names from the course files to understand what concepts are available for tracking",
    parameters: z.object({
      courseId: z.string().describe("The ID of the current course"),
    }),
    execute: async ({ courseId }) => getAllConcepts(courseId),
  }),
  setNextQuestion: tool({
    description: "Set the next question for the student in the course database",
    parameters: z.object({
      courseId: z.string().describe("The ID of the current course"),
      originalQuestion: z.object({
        question: z.string().describe("The baseline question text."),
        answers: z
          .array(z.string())
          .length(4)
          .describe("Array of 4 answer choices."),
        correctAnswer: z.string().describe("The correct answer text."),
      }),
      enhancedQuestion: z.object({
        question: z.string().describe("The preference-enhanced question text."),
        questionRephrased: z
          .string()
          .describe("A rephrased version of the enhanced question."),
        answers: z
          .array(z.string())
          .length(4)
          .describe("Array of 4 answer choices for the enhanced question."),
        correctAnswer: z
          .string()
          .describe("The correct answer for the enhanced question."),
        hint: z.string().describe("A hint for the enhanced question."),
        conceptCovered: z
          .string()
          .describe("The concept this question is about."),
        difficulty: z
          .enum(["EASY", "HARD"])
          .describe("The difficulty level of the question ('EASY' or 'HARD')"),
      }),
      message: z
        .string()
        .describe(
          "A friendly, encouraging message for the student to be displayed.",
        ),
    }),
    execute: async ({ courseId, originalQuestion, enhancedQuestion, message }) => {
      setNextQuestion(courseId, { originalQuestion, enhancedQuestion, message });
      return {
        success: true,
        question: enhancedQuestion.question,
        concept: enhancedQuestion.conceptCovered,
        difficulty: enhancedQuestion.difficulty,
        message: "Next question has been set successfully",
      };
    },
  }),
};

const TUTOR_HISTORY_LIMIT = 100;

async function runTutorTurn({ courseId, threadId, materials, prompt }) {
  addMessage({ threadId, role: "user", content: prompt });
  const history = getRecentMessages(threadId, TUTOR_HISTORY_LIMIT);

  const result = await generateText({
    model: getModel({ temperature: 0.2 }),
    system: instructions(courseId, materials.join("\n")),
    messages: history,
    tools: tutorAgentTools,
    maxSteps: 20,
    maxRetries: 2,
    temperature: 0.2,
  });

  addMessage({ threadId, role: "assistant", content: result.text || "" });
  return result;
}

export async function startCourse(courseId) {
  const courseWithFiles = getCourseWithFiles(courseId);
  if (!courseWithFiles) throw new Error("Course not found");
  if (courseWithFiles.files.length === 0)
    throw new Error("No files found in course");

  for (const file of courseWithFiles.files) {
    if (!file.metadata || file.metadata.description?.includes("Processing")) {
      throw new Error(
        "Please wait for the file to be processed before starting the course",
      );
    }
  }
  const materials = buildMaterials(courseWithFiles);

  initializeStudentProgress(courseId);

  // Knowledge graph and flashcards generate in the background, mirroring the
  // original scheduler.runAfter calls
  setTimeout(() => {
    generateKnowledgeGraph(courseId).catch((error) =>
      console.error("Knowledge graph generation failed:", error),
    );
  }, 1000);
  setTimeout(() => {
    generateFlashcards(courseId).catch((error) =>
      console.error("Flashcard generation failed:", error),
    );
  }, 2000);

  const selectedFiles = getSelectedFileIds(courseId);
  if (selectedFiles.length === 0)
    throw new Error("No files selected for course");

  const threadId = `tutor-${courseId}-${Date.now()}`;
  const preferences = getPreferences();

  const inputData = {
    context: {
      type: "start_lesson",
      currentDateTime: new Date().toISOString(),
      selectedMaterials: selectedFiles,
      user_preferences: preferences || undefined,
    },
    studentResponse: "",
  };

  await runTutorTurn({
    courseId,
    threadId,
    materials,
    prompt: JSON.stringify(inputData, null, 2),
  });

  updateCourse(courseId, { threadId });
  return threadId;
}

export async function answerQuestion(courseId, answer) {
  const courseWithFiles = getCourseWithFiles(courseId);
  if (!courseWithFiles) throw new Error("Course not found");

  const threadId = courseWithFiles.threadId;
  if (!threadId) throw new Error("Thread not found");

  const materials = buildMaterials(courseWithFiles);

  const selectedFiles = getSelectedFilesWithDetails(courseId);
  if (selectedFiles.length === 0)
    throw new Error("No files selected for course");

  const preferences = getPreferences();

  const inputData = {
    context: {
      type: "continue_lesson",
      currentDateTime: new Date().toISOString(),
      selectedMaterials: selectedFiles.map((f) => f.name),
      user_preferences: preferences || undefined,
    },
    studentResponse: answer,
  };

  await runTutorTurn({
    courseId,
    threadId,
    materials,
    prompt: JSON.stringify(inputData, null, 2),
  });

  return {
    success: true,
    message: "Answer processed and next question prepared",
  };
}

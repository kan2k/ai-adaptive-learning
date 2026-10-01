import { generateObject } from "ai";
import { z } from "zod";
import { getModel, hasLLM, MissingApiKeyError } from "./providers.js";

const explanationSchema = z.object({
  explanation: z
    .string()
    .describe(
      "2-3 sentence Socratic explanation of why the chosen option fails and what to notice",
    ),
});

const systemPrompt = `<role>You are a tutor explaining to a student why the answer they picked on a multiple-choice question does not hold.</role>

<instructions>
- Write 2-3 sentences, addressed directly to the student.
- Explain the specific flaw in the chosen option: what it confuses, overlooks, or overstates.
- Point at what to notice in the question or concept that distinguishes the right idea, Socratic-style.
- NEVER simply restate or announce the correct answer; guide the student toward seeing it.
- Plain sentences only: no headings, no bullet points, no "Great try!" filler.
</instructions>`;

export async function explainWrongAnswer({ question, answers, chosen, correct, concept }) {
  if (!hasLLM()) throw new MissingApiKeyError();

  const { object } = await generateObject({
    model: getModel({ tier: "fast", temperature: 0.3 }),
    schema: explanationSchema,
    system: systemPrompt,
    prompt: `Concept: ${concept || "unknown"}
Question: ${question}
Options: ${answers.map((a, i) => `${i + 1}. ${a}`).join("\n")}
Student chose: ${chosen}
Correct answer (for your reasoning only, do not restate it): ${correct}`,
    temperature: 0.3,
  });

  return { explanation: object.explanation };
}

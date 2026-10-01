# Local-first migration plan

Vision: open-source study tool. Point it at a folder of notes -> launch ->
study. No accounts, no cloud state, one API key (or none with Ollama). The
colorful UI is the brand and stays.

## Phase 1 — local-first gut renovation (THIS PHASE)

1. Remove Clerk. Single-user local app: no auth, no user table; preferences
   become a row in local storage DB.
2. Replace Convex with embedded SQLite (better-sqlite3) living in the notes
   folder at `.study/study.db`. The folder IS the app state: portable,
   git-able, delete-to-reset.
3. Folder = source of truth. `STUDY_DIR` env var (or `--dir` CLI arg) picks
   the folder; md/txt/pdf files are indexed; top-level subfolders map to
   courses; a chokidar watcher re-indexes on change.
4. LLM via OpenRouter only (`OPENROUTER_API_KEY`), model picker later;
   `OLLAMA_BASE_URL` as the offline alternative. Providers stay on ai-sdk.
5. Convex agent threads -> plain ai-sdk `streamText` in a Next route
   handler + `chat_threads`/`chat_messages` tables.
6. All Convex queries/mutations/actions become Next.js route handlers under
   `app/api/*` backed by a `src/server/db.js` layer; React components swap
   `useQuery/useMutation/useAction` for SWR + fetch.

## Phase 2 — LLM approach + feature upgrades (researched 2026-10-01)

How the serious platforms split the work (Khanmigo, Duolingo Max, and the
FSRS/LECTOR research line): a STRONG model for the live tutoring dialogue,
a CHEAP model for bulk content generation, and a DETERMINISTIC scheduler —
never the LLM — deciding when things get reviewed.

1. Model routing by task (env-driven, both through OpenRouter):
   - `OPENROUTER_MODEL_FAST` (default google/gemini-2.5-flash): concept
     extraction, flashcard/distractor generation, chat titles.
   - `OPENROUTER_MODEL_SMART` (default anthropic/claude-sonnet-5): the
     tutor agent (question adaptation, Socratic feedback, observations).
     This is where quality is felt; Khanmigo-class tutors run frontier
     models here (their RCT showed +0.34 SD algebra gains).
2. Structured outputs: replace "return JSON" prompts with ai-sdk
   `generateObject` + zod schemas for questions/flashcards/concepts/graph.
   Kills the JSON-parse failure class entirely (the new debug log shows
   any parse retry today).
3. FSRS scheduling (fsrs.js, FSRS-6): per-flashcard stability/
   retrievability, daily review queue. The LLM stops being asked to do
   spaced repetition in-prompt (it currently is) — research consensus:
   LLM for content, FSRS for timing ("without the scheduler you have a
   generator; with it, a study system").
4. Explain-my-answer: on a wrong answer, a short Socratic explanation of
   why the chosen option fails (Duolingo Max's most-loved feature).
5. Source citations: every question/answer links back to note + heading.
6. Study-session loop; knowledge graph stays the centerpiece.

## Phase 3 — OSS packaging (later)

New name, kan2k repo, Apache-2.0, README to trading-terminal standard,
agent-verified SETUP.md, `npx` one-command launch.
IP check with KIP before publishing — Jason's item.

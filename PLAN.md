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

## Phase 2 — feature upgrades (later)

FSRS spaced repetition + daily review queue; source citations back to
note/heading; study-session loop; knowledge graph stays the centerpiece.

## Phase 3 — OSS packaging (later)

New name, kan2k repo, Apache-2.0, README to trading-terminal standard,
agent-verified SETUP.md, `npx` one-command launch.
IP check with KIP before publishing — Jason's item.

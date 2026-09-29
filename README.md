# AI Adaptive Learning

Point it at a folder of notes, launch, study. The app indexes `.md`, `.txt`,
and `.pdf` files from `STUDY_DIR` (default `./notes`) — each top-level
subfolder becomes a course, files at the root land in a course named "Notes" —
and generates concepts, a knowledge graph, flashcards, an adaptive quiz, and a
tutor chat from them. All state lives in `<STUDY_DIR>/.study/study.db`; no
accounts, no cloud. Copy `.env.example` to `.env.local` and set
`OPENROUTER_API_KEY` (or `OLLAMA_BASE_URL` + `OLLAMA_MODEL` for local models),
then run:

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm start   # production
```

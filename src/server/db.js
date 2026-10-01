import Database from "better-sqlite3";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

export const STUDY_DIR = path.resolve(process.env.STUDY_DIR || "./notes");

const SAMPLE_NOTE = `# Welcome to your study folder

Drop .md, .txt, or .pdf notes in this folder (or subfolders) and they become
course material. Each top-level subfolder is a course; files at the root land
in a course named "Notes".

## Photosynthesis, a sample concept

Photosynthesis is the process by which plants convert light energy into
chemical energy stored as glucose. It takes place in the chloroplasts, where
chlorophyll absorbs light. The overall reaction combines carbon dioxide and
water to produce glucose and oxygen.
`;

export function ensureStudyDir() {
  if (!fs.existsSync(STUDY_DIR)) {
    fs.mkdirSync(STUDY_DIR, { recursive: true });
    fs.writeFileSync(path.join(STUDY_DIR, "Welcome.md"), SAMPLE_NOTE, "utf8");
  }
  const stateDir = path.join(STUDY_DIR, ".study");
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  return STUDY_DIR;
}

// globalThis singleton so next dev HMR does not open multiple handles
function openDb() {
  ensureStudyDir();
  const db = new Database(path.join(STUDY_DIR, ".study", "study.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      folder_path TEXT UNIQUE,
      created_at INTEGER NOT NULL,
      last_opened_at INTEGER,
      thread_id TEXT,
      learning_data TEXT
    );
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      uploaded_at INTEGER NOT NULL,
      source_path TEXT UNIQUE,
      text_content TEXT,
      metadata TEXT,
      selected INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS chat_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT UNIQUE NOT NULL,
      course_id INTEGER,
      title TEXT,
      created_at INTEGER NOT NULL,
      last_message_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON chat_messages(thread_id);
    CREATE INDEX IF NOT EXISTS idx_files_course ON files(course_id);
    CREATE TABLE IF NOT EXISTS file_cache (
      content_hash TEXT PRIMARY KEY,
      metadata TEXT NOT NULL,
      stashed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS flashcards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id),
      concept_title TEXT NOT NULL,
      related_area TEXT,
      text TEXT NOT NULL,
      suggestion_image TEXT,
      source_file_id INTEGER,
      source_heading TEXT,
      created_at INTEGER NOT NULL,
      generation_type TEXT,
      due INTEGER NOT NULL,
      stability REAL NOT NULL DEFAULT 0,
      difficulty REAL NOT NULL DEFAULT 0,
      reps INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0,
      state INTEGER NOT NULL DEFAULT 0,
      last_review INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_flashcards_course_due ON flashcards(course_id, due);
  `);
  migrateFlashcardsFromLearningData(db);
  const fileCols = db.prepare("PRAGMA table_info(files)").all().map((c) => c.name);
  if (!fileCols.includes("content_hash")) {
    db.prepare("ALTER TABLE files ADD COLUMN content_hash TEXT").run();
  }
  // Backfill: hash rows that predate the column, and seed the cache from
  // everything already generated so delete-and-re-add works for history.
  const unhashed = db
    .prepare("SELECT id, text_content FROM files WHERE content_hash IS NULL AND text_content IS NOT NULL")
    .all();
  for (const row of unhashed) {
    const hash = createHash("sha256").update(row.text_content).digest("hex");
    db.prepare("UPDATE files SET content_hash = ? WHERE id = ?").run(hash, row.id);
  }
  db.prepare(
    "INSERT OR IGNORE INTO file_cache (content_hash, metadata, stashed_at) SELECT content_hash, metadata, ? FROM files WHERE metadata IS NOT NULL AND content_hash IS NOT NULL",
  ).run(Date.now());
  return db;
}

// Flashcards used to live inside courses.learning_data JSON. Move them into
// the flashcards table as new FSRS cards due now, then strip the JSON key —
// stripping it is what makes a re-run a no-op.
function migrateFlashcardsFromLearningData(db) {
  const rows = db
    .prepare(
      "SELECT id, learning_data FROM courses WHERE learning_data LIKE '%\"flashcards\"%'",
    )
    .all();
  if (rows.length === 0) return;
  const insert = db.prepare(
    `INSERT INTO flashcards (course_id, concept_title, related_area, text, suggestion_image, created_at, generation_type, due)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const update = db.prepare("UPDATE courses SET learning_data = ? WHERE id = ?");
  const now = Date.now();
  db.transaction(() => {
    for (const row of rows) {
      let data;
      try {
        data = JSON.parse(row.learning_data);
      } catch {
        continue;
      }
      if (!data || !Array.isArray(data.flashcards)) continue;
      for (const card of data.flashcards) {
        if (!card || typeof card.flashCardText !== "string") continue;
        insert.run(
          row.id,
          card.conceptTitle || "Untitled concept",
          card.relatedArea || null,
          card.flashCardText,
          card.suggestionImage || null,
          card.createdAt || now,
          card.generationType || "pre-generated",
          now,
        );
      }
      delete data.flashcards;
      update.run(JSON.stringify(data), row.id);
    }
  })();
}

export function getDb() {
  if (!globalThis.__studyDb) {
    globalThis.__studyDb = openDb();
  }
  return globalThis.__studyDb;
}

const parse = (json, fallback) => {
  if (json === null || json === undefined) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
};

export function rowToCourse(row) {
  if (!row) return null;
  const db = getDb();
  const fileRows = db
    .prepare("SELECT id, selected FROM files WHERE course_id = ?")
    .all(row.id);
  return {
    _id: row.id,
    _creationTime: row.created_at,
    name: row.name,
    createdBy: "local",
    createdAt: row.created_at,
    lastOpenedAt: row.last_opened_at ?? undefined,
    threadId: row.thread_id ?? undefined,
    fileIds: fileRows.map((f) => f.id),
    selectedFileIds: fileRows.filter((f) => f.selected).map((f) => f.id),
    learningData: parse(row.learning_data, undefined),
  };
}

export function rowToFile(row, { includeText = false } = {}) {
  if (!row) return null;
  const file = {
    _id: row.id,
    _creationTime: row.uploaded_at,
    name: row.name,
    type: row.type,
    size: row.size,
    uploadedAt: row.uploaded_at,
    sourcePath: row.source_path,
    metadata: parse(row.metadata, undefined),
  };
  if (includeText) file.textContent = row.text_content ?? undefined;
  return file;
}

export function rowToThread(row) {
  if (!row) return null;
  return {
    _id: row.id,
    _creationTime: row.created_at,
    userId: "local",
    courseId: row.course_id ?? undefined,
    title: row.title ?? undefined,
    threadId: row.thread_id,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at ?? undefined,
  };
}

export function rowToMessage(row) {
  if (!row) return null;
  return {
    _id: row.id,
    _creationTime: row.created_at,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

// --- courses ---

export function listCourses() {
  const rows = getDb().prepare("SELECT * FROM courses").all();
  return rows
    .map(rowToCourse)
    .sort(
      (a, b) =>
        (b.lastOpenedAt || b.createdAt) - (a.lastOpenedAt || a.createdAt),
    );
}

export function getCourse(courseId) {
  const row = getDb()
    .prepare("SELECT * FROM courses WHERE id = ?")
    .get(Number(courseId));
  return rowToCourse(row);
}

export function getCourseWithFiles(courseId) {
  const course = getCourse(courseId);
  if (!course) return null;
  const rows = getDb()
    .prepare("SELECT * FROM files WHERE course_id = ?")
    .all(Number(courseId));
  return { ...course, files: rows.map((r) => rowToFile(r)) };
}

export function getCourseFiles(courseId, { includeText = false } = {}) {
  const rows = getDb()
    .prepare("SELECT * FROM files WHERE course_id = ?")
    .all(Number(courseId));
  return rows
    .map((r) => rowToFile(r, { includeText }))
    .sort((a, b) => b.uploadedAt - a.uploadedAt);
}

export function getSelectedFileIds(courseId) {
  return getDb()
    .prepare("SELECT id FROM files WHERE course_id = ? AND selected = 1")
    .all(Number(courseId))
    .map((r) => r.id);
}

export function getSelectedFilesWithDetails(courseId) {
  const rows = getDb()
    .prepare("SELECT * FROM files WHERE course_id = ? AND selected = 1")
    .all(Number(courseId));
  return rows.map((r) => rowToFile(r));
}

export function updateCourse(courseId, fields) {
  const db = getDb();
  const sets = [];
  const params = [];
  if (fields.name !== undefined) {
    sets.push("name = ?");
    params.push(fields.name);
  }
  if (fields.lastOpenedAt !== undefined) {
    sets.push("last_opened_at = ?");
    params.push(fields.lastOpenedAt);
  }
  if (fields.threadId !== undefined) {
    sets.push("thread_id = ?");
    params.push(fields.threadId);
  }
  if (fields.learningData !== undefined) {
    sets.push("learning_data = ?");
    params.push(JSON.stringify(fields.learningData));
  }
  if (sets.length === 0) return;
  params.push(Number(courseId));
  db.prepare(`UPDATE courses SET ${sets.join(", ")} WHERE id = ?`).run(
    ...params,
  );
}

export function mergeLearningData(courseId, patch) {
  const course = getCourse(courseId);
  if (!course) throw new Error("Course not found");
  updateCourse(courseId, {
    learningData: { ...(course.learningData || {}), ...patch },
  });
}

export function toggleFileSelection(courseId, fileId) {
  const db = getDb();
  const row = db
    .prepare("SELECT id, selected FROM files WHERE id = ? AND course_id = ?")
    .get(Number(fileId), Number(courseId));
  if (!row) throw new Error("File not found in course");
  db.prepare("UPDATE files SET selected = ? WHERE id = ?").run(
    row.selected ? 0 : 1,
    row.id,
  );
}

export function getFileById(fileId) {
  const row = getDb()
    .prepare("SELECT * FROM files WHERE id = ?")
    .get(Number(fileId));
  return rowToFile(row, { includeText: true });
}

export function saveFileMetadata(fileId, metadata) {
  const db = getDb();
  db.prepare("UPDATE files SET metadata = ? WHERE id = ?").run(
    JSON.stringify(metadata),
    Number(fileId),
  );
  // Cache by content hash so deleting a file and adding the same one back
  // restores identical concepts instantly - no regeneration, and progress
  // keyed by concept title lines up again.
  const row = db
    .prepare("SELECT content_hash FROM files WHERE id = ?")
    .get(Number(fileId));
  if (row?.content_hash) {
    db.prepare(
      "INSERT OR REPLACE INTO file_cache (content_hash, metadata, stashed_at) VALUES (?, ?, ?)",
    ).run(row.content_hash, JSON.stringify(metadata), Date.now());
  }
}

export function cachedMetadataForHash(hash) {
  if (!hash) return null;
  const row = getDb()
    .prepare("SELECT metadata FROM file_cache WHERE content_hash = ?")
    .get(hash);
  return row ? row.metadata : null;
}

// --- preferences (single local user) ---

export function getPreferences() {
  const row = getDb().prepare("SELECT data FROM preferences WHERE id = 1").get();
  return row ? parse(row.data, null) : null;
}

export function savePreferences(preferences) {
  getDb()
    .prepare(
      "INSERT INTO preferences (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
    )
    .run(JSON.stringify(preferences));
}

// --- chat ---

export function listThreads() {
  const rows = getDb().prepare("SELECT * FROM chat_threads").all();
  return rows
    .map(rowToThread)
    .sort(
      (a, b) =>
        (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt),
    );
}

export function getThread(threadId) {
  const row = getDb()
    .prepare("SELECT * FROM chat_threads WHERE thread_id = ?")
    .get(threadId);
  return rowToThread(row);
}

export function createThread({ threadId, courseId, title }) {
  const now = Date.now();
  getDb()
    .prepare(
      "INSERT INTO chat_threads (thread_id, course_id, title, created_at, last_message_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(threadId, courseId != null ? Number(courseId) : null, title ?? null, now, now);
  return getThread(threadId);
}

export function updateThread(threadId, fields) {
  const db = getDb();
  if (fields.title !== undefined) {
    db.prepare("UPDATE chat_threads SET title = ? WHERE thread_id = ?").run(
      fields.title,
      threadId,
    );
  }
  if (fields.lastMessageAt !== undefined) {
    db.prepare(
      "UPDATE chat_threads SET last_message_at = ? WHERE thread_id = ?",
    ).run(fields.lastMessageAt, threadId);
  }
}

export function deleteThread(threadId) {
  const db = getDb();
  db.prepare("DELETE FROM chat_messages WHERE thread_id = ?").run(threadId);
  db.prepare("DELETE FROM chat_threads WHERE thread_id = ?").run(threadId);
}

export function listMessages(threadId) {
  const rows = getDb()
    .prepare(
      "SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC, id ASC",
    )
    .all(threadId);
  return rows.map(rowToMessage);
}

export function getRecentMessages(threadId, limit) {
  const rows = getDb()
    .prepare(
      "SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
    )
    .all(threadId, limit);
  return rows
    .reverse()
    .map((r) => ({ role: r.role, content: r.content }));
}

export function addMessage({ threadId, role, content }) {
  const now = Date.now();
  const info = getDb()
    .prepare(
      "INSERT INTO chat_messages (thread_id, role, content, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(threadId, role, content, now);
  return info.lastInsertRowid;
}

export function updateMessageContent(messageId, content) {
  getDb()
    .prepare("UPDATE chat_messages SET content = ? WHERE id = ?")
    .run(content, Number(messageId));
}

// --- flashcards (FSRS-scheduled) ---

export function rowToFlashcard(row) {
  if (!row) return null;
  return {
    _id: row.id,
    courseId: row.course_id,
    conceptTitle: row.concept_title,
    relatedArea: row.related_area ?? undefined,
    flashCardText: row.text,
    suggestionImage: row.suggestion_image ?? undefined,
    sourceFileId: row.source_file_id ?? undefined,
    sourceFile: row.source_file_name ?? undefined,
    sourceHeading: row.source_heading ?? undefined,
    createdAt: row.created_at,
    generationType: row.generation_type ?? undefined,
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    lastReview: row.last_review ?? undefined,
  };
}

const FLASHCARD_SELECT = `
  SELECT flashcards.*, files.name AS source_file_name
  FROM flashcards LEFT JOIN files ON files.id = flashcards.source_file_id
`;

export function listFlashcards(courseId) {
  const rows = getDb()
    .prepare(`${FLASHCARD_SELECT} WHERE flashcards.course_id = ? ORDER BY flashcards.created_at ASC, flashcards.id ASC`)
    .all(Number(courseId));
  return rows.map(rowToFlashcard);
}

export function getFlashcardById(cardId) {
  const row = getDb()
    .prepare(`${FLASHCARD_SELECT} WHERE flashcards.id = ?`)
    .get(Number(cardId));
  return rowToFlashcard(row);
}

// New cards enter with the FSRS empty-card state (all zeros) and due = now,
// so they surface in the next review queue immediately.
export function insertFlashcards(courseId, cards) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO flashcards (course_id, concept_title, related_area, text, suggestion_image, source_file_id, source_heading, created_at, generation_type, due)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const now = Date.now();
  const inserted = db.transaction(() => {
    let count = 0;
    for (const card of cards) {
      insert.run(
        Number(courseId),
        card.conceptTitle || "Untitled concept",
        card.relatedArea || null,
        card.flashCardText || "",
        card.suggestionImage || null,
        card.sourceFileId != null ? Number(card.sourceFileId) : null,
        card.sourceHeading || null,
        now,
        card.generationType || "pre-generated",
        now,
      );
      count++;
    }
    return count;
  })();
  return inserted;
}

export function updateFlashcardReview(cardId, next) {
  getDb()
    .prepare(
      `UPDATE flashcards
       SET due = ?, stability = ?, difficulty = ?, reps = ?, lapses = ?, state = ?, last_review = ?
       WHERE id = ?`,
    )
    .run(
      next.due,
      next.stability,
      next.difficulty,
      next.reps,
      next.lapses,
      next.state,
      next.lastReview,
      Number(cardId),
    );
  return getFlashcardById(cardId);
}

export function getDueFlashcards(courseId, now = Date.now()) {
  const rows = getDb()
    .prepare(`${FLASHCARD_SELECT} WHERE flashcards.course_id = ? AND due <= ? ORDER BY due ASC`)
    .all(Number(courseId), now);
  return rows.map(rowToFlashcard);
}

export function getReviewCounts(courseId, now = new Date()) {
  const db = getDb();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const count = (sql, ...params) =>
    db.prepare(sql).get(Number(courseId), ...params).n;
  return {
    dueNow: count(
      "SELECT COUNT(*) n FROM flashcards WHERE course_id = ? AND due <= ?",
      now.getTime(),
    ),
    dueToday: count(
      "SELECT COUNT(*) n FROM flashcards WHERE course_id = ? AND due <= ?",
      endOfDay.getTime(),
    ),
    total: count("SELECT COUNT(*) n FROM flashcards WHERE course_id = ?"),
  };
}

export function deleteFlashcardsByCourse(courseId) {
  getDb()
    .prepare("DELETE FROM flashcards WHERE course_id = ?")
    .run(Number(courseId));
}

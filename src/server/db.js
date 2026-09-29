import Database from "better-sqlite3";
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
    CREATE TABLE IF NOT EXISTS preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL
    );
  `);
  return db;
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
  getDb()
    .prepare("UPDATE files SET metadata = ? WHERE id = ?")
    .run(JSON.stringify(metadata), Number(fileId));
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

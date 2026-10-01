import fs from "fs";
import path from "path";
import {
  getDb,
  ensureStudyDir,
  STUDY_DIR,
} from "./db.js";
import { ensureMetadataForCourse } from "./llm/generateMetadata.js";

const INDEXABLE = new Set([".md", ".txt", ".pdf"]);
const ROOT_COURSE_NAME = "Notes";

const MIME = {
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".pdf": "application/pdf",
};

async function extractPdfText(filePath) {
  // Legacy build is the Node-safe entry point for pdfjs-dist
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;
  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map((item) => item.str).join(" ") + "\n\n";
  }
  await pdf.destroy();
  return fullText.trim();
}

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return extractPdfText(filePath);
  return fs.readFileSync(filePath, "utf8");
}

function listIndexableFiles(dir, depth = 0) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...listIndexableFiles(full, depth + 1));
    } else if (INDEXABLE.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

function upsertCourse(folderPath, name) {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM courses WHERE folder_path = ?")
    .get(folderPath);
  if (existing) {
    db.prepare("UPDATE courses SET name = ? WHERE id = ?").run(
      name,
      existing.id,
    );
    return existing.id;
  }
  const info = db
    .prepare(
      "INSERT INTO courses (name, folder_path, created_at, last_opened_at) VALUES (?, ?, ?, ?)",
    )
    .run(name, folderPath, Date.now(), Date.now());
  return info.lastInsertRowid;
}

function courseIdForFile(filePath) {
  const rel = path.relative(STUDY_DIR, filePath);
  const top = rel.split(path.sep)[0];
  const isRootFile = top === rel;
  if (isRootFile) {
    return upsertCourse(STUDY_DIR, ROOT_COURSE_NAME);
  }
  return upsertCourse(path.join(STUDY_DIR, top), top);
}

async function indexFile(filePath) {
  const db = getDb();
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return;
  }
  const existing = db
    .prepare("SELECT * FROM files WHERE source_path = ?")
    .get(filePath);
  const courseId = courseIdForFile(filePath);
  if (
    existing &&
    existing.uploaded_at === Math.round(stat.mtimeMs) &&
    existing.size === stat.size &&
    existing.text_content !== null
  ) {
    if (existing.course_id !== courseId) {
      db.prepare("UPDATE files SET course_id = ? WHERE id = ?").run(
        courseId,
        existing.id,
      );
    }
    return;
  }

  let text = "";
  try {
    text = await extractText(filePath);
  } catch (error) {
    console.error(`[scanner] Failed to extract text from ${filePath}:`, error);
  }

  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  if (existing) {
    db.prepare(
      "UPDATE files SET course_id = ?, name = ?, type = ?, size = ?, uploaded_at = ?, text_content = ?, metadata = NULL WHERE id = ?",
    ).run(
      courseId,
      name,
      MIME[ext] || "text/plain",
      stat.size,
      Math.round(stat.mtimeMs),
      text,
      existing.id,
    );
  } else {
    db.prepare(
      "INSERT INTO files (course_id, name, type, size, uploaded_at, source_path, text_content, selected) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
    ).run(
      courseId,
      name,
      MIME[ext] || "text/plain",
      stat.size,
      Math.round(stat.mtimeMs),
      filePath,
      text,
    );
  }
  // Concepts generate as soon as a file is indexed, so "Begin course" is
  // usually ready by the time a human reaches it (no-op without an LLM key;
  // in-flight guard makes repeat calls cheap).
  ensureMetadataForCourse(courseId);
}

function removeMissing(presentPaths) {
  const db = getDb();
  const known = db.prepare("SELECT id, source_path FROM files").all();
  const present = new Set(presentPaths);
  for (const row of known) {
    if (row.source_path && !present.has(row.source_path)) {
      db.prepare("DELETE FROM files WHERE id = ?").run(row.id);
    }
  }
  // Drop courses whose folder disappeared and that hold no files
  const courses = db.prepare("SELECT id, folder_path FROM courses").all();
  for (const course of courses) {
    const hasFiles = db
      .prepare("SELECT 1 FROM files WHERE course_id = ? LIMIT 1")
      .get(course.id);
    const folderExists = course.folder_path && fs.existsSync(course.folder_path);
    if (!hasFiles && !folderExists) {
      db.prepare("DELETE FROM courses WHERE id = ?").run(course.id);
    }
  }
}

export async function scan() {
  ensureStudyDir();
  const files = listIndexableFiles(STUDY_DIR);
  for (const filePath of files) {
    await indexFile(filePath);
  }
  removeMissing(files);
}

let rescanTimer = null;
function scheduleRescan() {
  if (rescanTimer) clearTimeout(rescanTimer);
  rescanTimer = setTimeout(() => {
    rescanTimer = null;
    scan().catch((error) => console.error("[scanner] rescan failed:", error));
  }, 750);
}

async function startWatcher() {
  const { watch } = await import("chokidar");
  const watcher = watch(STUDY_DIR, {
    ignored: (watchedPath) =>
      watchedPath
        .split(path.sep)
        .some((part) => part.startsWith(".") && part.length > 1) ||
      watchedPath.includes("node_modules"),
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
  });
  watcher.on("add", scheduleRescan);
  watcher.on("change", scheduleRescan);
  watcher.on("unlink", scheduleRescan);
  watcher.on("unlinkDir", scheduleRescan);
  return watcher;
}

export function ensureScanner() {
  if (!globalThis.__studyScanner) {
    globalThis.__studyScanner = (async () => {
      await scan();
      await startWatcher();
      console.log(`[scanner] watching ${STUDY_DIR}`);
    })().catch((error) => {
      console.error("[scanner] failed to start:", error);
      globalThis.__studyScanner = null;
      throw error;
    });
  }
  return globalThis.__studyScanner;
}

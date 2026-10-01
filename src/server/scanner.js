import fs from "fs";
import crypto from "crypto";
import { logError } from "./log.js";
import path from "path";
import {
  getDb,
  ensureStudyDir,
  STUDY_DIR,
  cachedMetadataForHash,
} from "./db.js";
import { ensureMetadataForCourse } from "./llm/generateMetadata.js";

const INDEXABLE = new Set([".md", ".txt", ".pdf", ".docx", ".pptx"]);
const ROOT_COURSE_NAME = "Notes";

const MIME = {
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
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

async function extractDocxText(filePath) {
  const mammoth = (await import("mammoth")).default;
  // Markdown conversion keeps headings, which feed structure and citations.
  const result = await mammoth.convertToMarkdown({ path: filePath });
  return result.value.trim();
}

async function extractPptxText(filePath) {
  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip(filePath);
  const slides = zip
    .getEntries()
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort(
      (a, b) =>
        parseInt(a.entryName.match(/\d+/)[0]) -
        parseInt(b.entryName.match(/\d+/)[0]),
    );
  const parts = [];
  for (const slide of slides) {
    const xml = slide.getData().toString("utf8");
    // <a:t> holds every visible text run; <a:p> boundaries become lines.
    const paragraphs = xml
      .split(/<\/a:p>/)
      .map((p) =>
        [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
          .map((m) => m[1])
          .join("")
          .trim(),
      )
      .filter(Boolean);
    if (!paragraphs.length) continue;
    const n = parseInt(slide.entryName.match(/\d+/)[0]);
    const title = paragraphs[0].slice(0, 80);
    parts.push(`# Slide ${n}: ${title}\n\n${paragraphs.join("\n")}`);
  }
  return parts.join("\n\n");
}

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return extractPdfText(filePath);
  if (ext === ".docx") return extractDocxText(filePath);
  if (ext === ".pptx") return extractPptxText(filePath);
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
    logError("llm", error, { where: `[scanner] Failed to extract text from ${filePath}:` });
  }

  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  const hash = text
    ? crypto.createHash("sha256").update(text).digest("hex")
    : null;
  // Identical content seen before (same file re-added, or renamed) reuses
  // its generated concepts instead of paying for regeneration.
  const cached = cachedMetadataForHash(hash);
  if (existing) {
    db.prepare(
      "UPDATE files SET course_id = ?, name = ?, type = ?, size = ?, uploaded_at = ?, text_content = ?, content_hash = ?, metadata = ? WHERE id = ?",
    ).run(
      courseId,
      name,
      MIME[ext] || "text/plain",
      stat.size,
      Math.round(stat.mtimeMs),
      text,
      hash,
      cached,
      existing.id,
    );
  } else {
    db.prepare(
      "INSERT INTO files (course_id, name, type, size, uploaded_at, source_path, text_content, content_hash, metadata, selected) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
    ).run(
      courseId,
      name,
      MIME[ext] || "text/plain",
      stat.size,
      Math.round(stat.mtimeMs),
      filePath,
      text,
      hash,
      cached,
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
    scan().catch((error) => logError("llm", error, { where: "[scanner] rescan failed:" }));
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
      logError("llm", error, { where: "[scanner] failed to start:" });
      globalThis.__studyScanner = null;
      throw error;
    });
  }
  return globalThis.__studyScanner;
}

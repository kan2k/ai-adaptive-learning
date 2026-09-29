import fs from "fs";
import path from "path";
import { handle, httpError } from "@/server/http";
import {
  getDb,
  getCourse,
  getCourseWithFiles,
  updateCourse,
  STUDY_DIR,
} from "@/server/db";
import { safeName } from "@/server/safe-name";

export async function GET(request, { params }) {
  const { id } = await params;
  return handle(() => getCourseWithFiles(id));
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  return handle(async () => {
    const body = await request.json();
    const course = getCourse(id);
    if (!course) throw httpError("Course not found", 404);

    if (body.opened) {
      updateCourse(id, { lastOpenedAt: Date.now() });
    }
    if (typeof body.name === "string" && body.name.trim()) {
      const newName = safeName(body.name);
      const db = getDb();
      const row = db
        .prepare("SELECT folder_path FROM courses WHERE id = ?")
        .get(Number(id));
      // Renaming a course renames its folder so the folder stays the source
      // of truth; the root "Notes" course keeps STUDY_DIR itself.
      if (
        row?.folder_path &&
        path.resolve(row.folder_path) !== path.resolve(STUDY_DIR) &&
        fs.existsSync(row.folder_path)
      ) {
        const newFolder = path.join(STUDY_DIR, newName);
        if (!fs.existsSync(newFolder)) {
          fs.renameSync(row.folder_path, newFolder);
          db.prepare("UPDATE courses SET folder_path = ? WHERE id = ?").run(
            newFolder,
            Number(id),
          );
          db.prepare(
            "UPDATE files SET source_path = REPLACE(source_path, ?, ?) WHERE course_id = ?",
          ).run(row.folder_path, newFolder, Number(id));
        }
      }
      updateCourse(id, { name: newName });
    }
    return { success: true };
  });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  return handle(async () => {
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM courses WHERE id = ?")
      .get(Number(id));
    if (!row) throw httpError("Course not found", 404);

    // The folder is the state: deleting a course deletes its notes from disk.
    // The root "Notes" course only removes its own indexed files, never the
    // whole study dir.
    if (
      row.folder_path &&
      path.resolve(row.folder_path) !== path.resolve(STUDY_DIR) &&
      fs.existsSync(row.folder_path)
    ) {
      fs.rmSync(row.folder_path, { recursive: true, force: true });
    } else {
      const files = db
        .prepare("SELECT source_path FROM files WHERE course_id = ?")
        .all(row.id);
      for (const file of files) {
        if (file.source_path && fs.existsSync(file.source_path)) {
          fs.rmSync(file.source_path, { force: true });
        }
      }
    }

    db.prepare("DELETE FROM files WHERE course_id = ?").run(row.id);
    db.prepare("DELETE FROM courses WHERE id = ?").run(row.id);

    return { success: true };
  });
}

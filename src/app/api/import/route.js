import fs from "fs";
import path from "path";
import { handle, httpError } from "@/server/http";
import { getDb, STUDY_DIR } from "@/server/db";
import { scan } from "@/server/scanner";

const ALLOWED = new Set([".md", ".txt", ".pdf"]);

export async function POST(request) {
  return handle(async () => {
    const formData = await request.formData();
    const file = formData.get("file");
    const courseId = formData.get("courseId");
    if (!file || typeof file === "string") throw httpError("file is required");
    if (!courseId) throw httpError("courseId is required");

    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED.has(ext)) {
      throw httpError("Only .md, .txt, and .pdf files are supported");
    }

    const course = getDb()
      .prepare("SELECT * FROM courses WHERE id = ?")
      .get(Number(courseId));
    if (!course) throw httpError("Course not found", 404);

    const targetDir =
      course.folder_path && fs.existsSync(course.folder_path)
        ? course.folder_path
        : STUDY_DIR;

    const base = path.basename(file.name, ext);
    let targetName = `${base}${ext}`;
    let counter = 2;
    while (fs.existsSync(path.join(targetDir, targetName))) {
      targetName = `${base} (${counter++})${ext}`;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(targetDir, targetName), buffer);

    // Index right away instead of waiting on the watcher debounce
    await scan();

    return { success: true, name: targetName };
  });
}

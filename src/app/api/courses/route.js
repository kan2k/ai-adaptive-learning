import fs from "fs";
import path from "path";
import { handle } from "@/server/http";
import { getDb, listCourses, getCourse, STUDY_DIR } from "@/server/db";
import { safeName } from "@/server/safe-name";

export async function GET() {
  return handle(() => listCourses());
}

export async function POST(request) {
  return handle(async () => {
    const body = await request.json().catch(() => ({}));
    const baseName = safeName(body.name || "Untitled Course");

    // A course is a folder in the study dir; dedupe the name if taken
    let name = baseName;
    let counter = 2;
    while (fs.existsSync(path.join(STUDY_DIR, name))) {
      name = `${baseName} ${counter++}`;
    }
    const folderPath = path.join(STUDY_DIR, name);
    fs.mkdirSync(folderPath, { recursive: true });

    const info = getDb()
      .prepare(
        "INSERT INTO courses (name, folder_path, created_at, last_opened_at) VALUES (?, ?, ?, ?)",
      )
      .run(name, folderPath, Date.now(), Date.now());

    return getCourse(info.lastInsertRowid);
  });
}

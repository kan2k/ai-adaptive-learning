import fs from "fs";
import { handle, httpError } from "@/server/http";
import { getDb } from "@/server/db";

export async function DELETE(request, { params }) {
  const { id, fileId } = await params;
  return handle(async () => {
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM files WHERE id = ? AND course_id = ?")
      .get(Number(fileId), Number(id));
    if (!row) throw httpError("File not found in course", 404);

    if (row.source_path && fs.existsSync(row.source_path)) {
      fs.rmSync(row.source_path, { force: true });
    }
    db.prepare("DELETE FROM files WHERE id = ?").run(row.id);

    return { success: true };
  });
}

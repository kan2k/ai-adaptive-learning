import { handle, httpError } from "@/server/http";
import { getCourse, updateCourse } from "@/server/db";

export async function POST(request, { params }) {
  const { id } = await params;
  return handle(async () => {
    const course = getCourse(id);
    if (!course) throw httpError("Course not found", 404);
    updateCourse(id, { learningData: {} });
    return { success: true };
  });
}

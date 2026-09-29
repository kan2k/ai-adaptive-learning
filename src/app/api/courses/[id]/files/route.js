import { handle } from "@/server/http";
import { getCourseFiles } from "@/server/db";
import { ensureMetadataForCourse } from "@/server/llm/generateMetadata";

export async function GET(request, { params }) {
  const { id } = await params;
  return handle(() => {
    // Kick off concept extraction for freshly indexed files; the poll that
    // fetches this list picks up status changes on later calls.
    ensureMetadataForCourse(id);
    return getCourseFiles(id);
  });
}

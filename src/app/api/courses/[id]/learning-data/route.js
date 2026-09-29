import { handle } from "@/server/http";
import { getLearningData } from "@/server/learning";

export async function GET(request, { params }) {
  const { id } = await params;
  return handle(() => getLearningData(id));
}

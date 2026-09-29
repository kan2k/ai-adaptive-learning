import { handle } from "@/server/http";
import {
  getSelectedFileIds,
  getSelectedFilesWithDetails,
  toggleFileSelection,
} from "@/server/db";

export async function GET(request, { params }) {
  const { id } = await params;
  const details = new URL(request.url).searchParams.get("details");
  return handle(() =>
    details ? getSelectedFilesWithDetails(id) : getSelectedFileIds(id),
  );
}

export async function POST(request, { params }) {
  const { id } = await params;
  return handle(async () => {
    const body = await request.json();
    toggleFileSelection(id, body.fileId);
    return null;
  });
}

import path from "path";
import { STUDY_DIR } from "./db.js";
import { httpError } from "./http.js";

// Request-supplied names become filesystem paths under STUDY_DIR; this is a
// no-auth localhost server, so they must never escape it.
export function safeName(rawName) {
  if (typeof rawName !== "string") throw httpError("Invalid name");
  const name = rawName.trim();
  if (
    !name ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.startsWith(".") ||
    name !== path.basename(name)
  ) {
    throw httpError("Invalid name");
  }
  const root = path.resolve(STUDY_DIR);
  const resolved = path.resolve(root, name);
  if (resolved === root || !resolved.startsWith(root + path.sep)) {
    throw httpError("Invalid name");
  }
  return name;
}

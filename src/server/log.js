import fs from "fs";
import path from "path";
import { STUDY_DIR } from "./db.js";

// JSONL log at <STUDY_DIR>/.study/logs/app.log — one place to look when
// anything misbehaves. Capped by rotation so a chatty session can't eat the
// notes folder.
const MAX_BYTES = 2 * 1024 * 1024;
const KEEP_RECENT = 200;

const recent = [];

function logFile() {
  const dir = path.join(STUDY_DIR, ".study", "logs");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "app.log");
}

function rotate(file) {
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
      fs.renameSync(file, file.replace(/\.log$/, ".prev.log"));
    }
  } catch {
    /* rotation is best-effort */
  }
}

export function log(level, event, fields = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
  recent.push(entry);
  if (recent.length > KEEP_RECENT) recent.shift();
  const line = JSON.stringify(entry);
  if (level === "error") console.error(`[${event}]`, line);
  else console.log(`[${event}]`, line);
  try {
    const file = logFile();
    rotate(file);
    fs.appendFileSync(file, line + "\n");
  } catch {
    /* console output already happened */
  }
}

export function logError(event, error, fields = {}) {
  log("error", event, {
    message: error?.message || String(error),
    status: error?.status,
    stack: error?.stack?.split("\n").slice(0, 6).join("\n"),
    ...fields,
  });
}

/** In-memory tail for /api/debug — survives only the process, the file
 *  survives restarts. */
export function recentEntries(level) {
  return level ? recent.filter((e) => e.level === level) : [...recent];
}

export function installProcessHandlers() {
  if (globalThis.__logHandlersInstalled) return;
  globalThis.__logHandlersInstalled = true;
  process.on("unhandledRejection", (reason) =>
    logError("unhandled_rejection", reason),
  );
  process.on("uncaughtException", (error) =>
    logError("uncaught_exception", error),
  );
}

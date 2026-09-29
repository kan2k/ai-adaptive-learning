import { ensureScanner } from "./scanner.js";

// Every API route funnels through this: the scanner lazy-starts on first hit
// (instrumentation.js also starts it on boot) and errors become JSON.
export async function handle(fn) {
  try {
    await ensureScanner();
    const data = await fn();
    return Response.json(data ?? null);
  } catch (error) {
    console.error("[api]", error);
    const status =
      typeof error?.status === "number" && error.status >= 400
        ? error.status
        : 500;
    return Response.json(
      { error: error?.message || "Internal error" },
      { status },
    );
  }
}

export function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

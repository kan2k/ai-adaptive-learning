import { ensureScanner } from "./scanner.js";
import { logError, log } from "./log.js";

// Every API route funnels through this: the scanner lazy-starts on first hit
// (instrumentation.js also starts it on boot), errors become JSON and land
// in the debug log with their route. Slow requests (>5s) are logged too so
// LLM stalls are visible without an error.
export async function handle(fn, context = {}) {
  const started = Date.now();
  try {
    await ensureScanner();
    const data = await fn();
    const ms = Date.now() - started;
    if (ms > 5000) log("warn", "slow_request", { ...context, ms });
    return Response.json(data ?? null);
  } catch (error) {
    const status =
      typeof error?.status === "number" && error.status >= 400
        ? error.status
        : 500;
    // 4xx are expected states (e.g. "still preparing"); 5xx are bugs.
    if (status >= 500) logError("api_error", error, context);
    else log("warn", "api_reject", { ...context, status, message: error?.message });
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

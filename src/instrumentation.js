export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installProcessHandlers } = await import("./server/log.js");
    installProcessHandlers();
    const { ensureScanner } = await import("./server/scanner.js");
    ensureScanner();
  }
}

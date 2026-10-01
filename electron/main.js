import { app, BrowserWindow, shell, dialog } from "electron";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import net from "net";
import http from "http";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Packaged: resources/standalone next to the asar; dev: repo root.
const serverPath = app.isPackaged
  ? path.join(process.resourcesPath, "standalone", "server.js")
  : path.join(here, "..", "standalone", "server.js");

const notesDir = path.join(app.getPath("documents"), "StudyNotes");
// Same key store the npx launcher writes, so either entry point works.
function savedLLMEnv() {
  try {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(app.getPath("home"), ".config", "ai-adaptive-learning.json"), "utf8"),
    );
    return {
      ...(cfg.openrouterApiKey ? { OPENROUTER_API_KEY: cfg.openrouterApiKey } : {}),
      ...(cfg.ollamaBaseUrl ? { OLLAMA_BASE_URL: cfg.ollamaBaseUrl } : {}),
    };
  } catch {
    return {};
  }
}
const firstRunMarker = path.join(app.getPath("userData"), ".not-first-run");

function ensureNotesDir() {
  const firstRun = !fs.existsSync(firstRunMarker);
  fs.mkdirSync(notesDir, { recursive: true });
  if (!fs.readdirSync(notesDir).some((f) => !f.startsWith("."))) {
    fs.writeFileSync(
      path.join(notesDir, "welcome.md"),
      "# Welcome\n\nDrop your notes, lecture slides (.pptx), handouts (.docx), PDFs,\nor markdown files into this folder and they become courses.\n",
    );
  }
  return firstRun;
}

function freePort(start) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(freePort(start + 1)));
    srv.listen(start, "127.0.0.1", () => srv.close(() => resolve(start)));
  });
}

function waitForReady(url, timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - started > timeoutMs) reject(new Error("Server did not start"));
          else setTimeout(poll, 300);
        });
    };
    poll();
  });
}

let serverProc = null;

// electron-builder strips directories literally named node_modules from
// extraResources, so the server's dependencies ship as "nmodules" and are
// renamed back on first launch — ESM imports ignore NODE_PATH, so only a
// real node_modules directory resolves for them.
function restoreNodeModules() {
  const base = path.dirname(serverPath);
  const shipped = path.join(base, "nmodules");
  const target = path.join(base, "node_modules");
  if (!fs.existsSync(target) && fs.existsSync(shipped)) {
    fs.renameSync(shipped, target);
  }
}

app.whenReady().then(async () => {
  try {
    const firstRun = ensureNotesDir();

    // Window appears immediately — dead seconds with no window read as a
    // broken app. Splash swaps to the real UI once the server answers.
    const win = new BrowserWindow({
      width: 1440,
      height: 920,
      title: "StudyNotes",
      backgroundColor: "#facc15",
      autoHideMenuBar: true,
    });
    win.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:repeating-linear-gradient(45deg,#facc15,#facc15 24px,#fbbf24 24px,#fbbf24 48px);font-family:system-ui"><div style="font-size:64px">&#128218;</div><div style="font-size:22px;font-weight:700;color:#422006">Warming up your study space&hellip;</div></body>`,
        ),
    );

    restoreNodeModules();
    const port = await freePort(3741);

    // ELECTRON_RUN_AS_NODE runs this same binary as plain Node, so the
    // server's prebuilt native modules (better-sqlite3) load with the Node
    // ABI they shipped with — no electron-rebuild step.
    serverProc = spawn(process.execPath, [serverPath], {
      env: {
        ...process.env,
        ...savedLLMEnv(),
        ELECTRON_RUN_AS_NODE: "1",
        STUDY_DIR: notesDir,
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
        NODE_ENV: "production",
      },
      stdio: "ignore",
    });

    const url = `http://127.0.0.1:${port}`;
    await waitForReady(url);
    win.loadURL(url);
    // External links (OpenRouter signup etc.) go to the real browser.
    win.webContents.setWindowOpenHandler(({ url: ext }) => {
      shell.openExternal(ext);
      return { action: "deny" };
    });

    if (firstRun) {
      fs.writeFileSync(firstRunMarker, "");
      shell.openPath(notesDir);
    }
  } catch (error) {
    dialog.showErrorBox("Could not start", String(error?.message || error));
    app.quit();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
app.on("quit", () => {
  if (serverProc) serverProc.kill();
});

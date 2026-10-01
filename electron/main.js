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
const llmConfigPath = path.join(app.getPath("home"), ".config", "ai-adaptive-learning.json");

function loadLLMConfig() {
  try {
    return JSON.parse(fs.readFileSync(llmConfigPath, "utf8"));
  } catch {
    return {};
  }
}

function saveLLMConfig(cfg) {
  fs.mkdirSync(path.dirname(llmConfigPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(llmConfigPath, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

function savedLLMEnv() {
  const cfg = loadLLMConfig();
  return {
    ...(cfg.provider ? { LLM_PROVIDER: cfg.provider } : {}),
    ...(cfg.apiKey || cfg.openrouterApiKey
      ? { LLM_API_KEY: cfg.apiKey || cfg.openrouterApiKey }
      : {}),
    ...(cfg.baseUrl ? { LLM_BASE_URL: cfg.baseUrl } : {}),
    ...(cfg.ollamaBaseUrl ? { OLLAMA_BASE_URL: cfg.ollamaBaseUrl } : {}),
  };
}

// Mirrors src/server/llm/providers.js PROVIDERS — the setup page is a plain
// data: URL with no module access.
const SETUP_PROVIDERS = [
  ["openrouter", "OpenRouter (300+ models, one key)", "https://openrouter.ai/keys"],
  ["openai", "OpenAI", "https://platform.openai.com/api-keys"],
  ["anthropic", "Anthropic", "https://console.anthropic.com/settings/keys"],
  ["google", "Google AI Studio", "https://aistudio.google.com/apikey"],
  ["groq", "Groq", "https://console.groq.com/keys"],
  ["deepseek", "DeepSeek", "https://platform.deepseek.com/api_keys"],
  ["mistral", "Mistral", "https://console.mistral.ai/api-keys"],
  ["together", "Together AI", "https://api.together.ai/settings/api-keys"],
  ["ollama", "Ollama (local, free, no key)", ""],
  ["custom", "Custom OpenAI-compatible endpoint", ""],
];

function setupPage() {
  const options = SETUP_PROVIDERS.map(
    ([id, label]) => `<option value="${id}">${label}</option>`,
  ).join("");
  const keyUrls = JSON.stringify(Object.fromEntries(SETUP_PROVIDERS.map(([id, , u]) => [id, u])));
  return (
    "data:text/html;charset=utf-8," +
    encodeURIComponent(`<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(45deg,#facc15,#facc15 24px,#fbbf24 24px,#fbbf24 48px);font-family:system-ui">
<form action="studynotes://save" style="background:#fff;border-radius:24px;padding:40px 44px;width:460px;box-shadow:0 30px 80px rgba(0,0,0,.25)">
  <div style="font-size:40px">&#128218;</div>
  <h1 style="font-size:24px;margin:10px 0 4px">Connect an AI</h1>
  <p style="color:#555;margin:0 0 20px;font-size:14px">One key powers your tutor. Typical cost: about $1/month of daily studying. Your key stays on this computer.</p>
  <label style="font-size:13px;font-weight:600">Provider</label><br>
  <select name="provider" id="prov" style="width:100%;padding:10px;margin:6px 0 14px;border-radius:10px;border:1px solid #ddd;font-size:14px">${options}</select><br>
  <div id="keyrow"><label style="font-size:13px;font-weight:600">API key</label>
  <a id="geturl" href="https://openrouter.ai/keys" target="_blank" style="font-size:12px;float:right">Get a free key &rarr;</a><br>
  <input name="key" id="key" type="password" placeholder="sk-..." style="width:100%;padding:10px;margin:6px 0 14px;border-radius:10px;border:1px solid #ddd;font-size:14px;box-sizing:border-box"></div>
  <div id="urlrow" style="display:none"><label style="font-size:13px;font-weight:600">Base URL</label><br>
  <input name="baseUrl" id="baseUrl" placeholder="http://localhost:11434/v1" style="width:100%;padding:10px;margin:6px 0 14px;border-radius:10px;border:1px solid #ddd;font-size:14px;box-sizing:border-box"></div>
  <button style="width:100%;padding:13px;border:0;border-radius:12px;background:#a3e635;font-weight:700;font-size:15px;cursor:pointer">Start studying</button>
  <a href="studynotes://skip" style="display:block;text-align:center;margin-top:12px;font-size:13px;color:#888">Skip for now</a>
</form>
<script>
  const urls = ${keyUrls};
  const prov = document.getElementById("prov");
  prov.addEventListener("change", () => {
    const u = urls[prov.value];
    document.getElementById("geturl").style.display = u ? "" : "none";
    document.getElementById("geturl").href = u || "#";
    document.getElementById("keyrow").style.display = prov.value === "ollama" ? "none" : "";
    document.getElementById("urlrow").style.display = (prov.value === "custom" || prov.value === "ollama") ? "" : "none";
  });
</script></body>`)
  );
}

function runSetup(win) {
  return new Promise((resolve) => {
    win.loadURL(setupPage());
    win.webContents.on("will-navigate", (event, target) => {
      if (!target.startsWith("studynotes://")) return;
      event.preventDefault();
      const u = new URL(target);
      if (u.host === "save") {
        const provider = u.searchParams.get("provider") || "openrouter";
        const key = (u.searchParams.get("key") || "").trim();
        const baseUrl = (u.searchParams.get("baseUrl") || "").trim();
        const cfg = { ...loadLLMConfig(), provider };
        if (key) cfg.apiKey = key;
        if (baseUrl) cfg.baseUrl = baseUrl;
        saveLLMConfig(cfg);
      }
      resolve();
    });
  });
}

function needsSetup() {
  const cfg = loadLLMConfig();
  if (cfg.provider === "ollama" || cfg.provider === "custom") return false;
  return !(cfg.apiKey || cfg.openrouterApiKey || process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY);
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

    if (needsSetup()) {
      await runSetup(win);
      win.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            `<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#facc15;font-family:system-ui;font-size:20px;font-weight:700;color:#422006">Warming up your study space&hellip;</body>`,
          ),
      );
    }

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

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

let fontCssCache = null;
function fontCss() {
  if (fontCssCache !== null) return fontCssCache;
  try {
    const dir = path.join(path.dirname(serverPath), "public", "fonts", "Menco");
    const med = fs.readFileSync(path.join(dir, "Menco-Medium.otf")).toString("base64");
    const bold = fs.readFileSync(path.join(dir, "Menco-Bold.otf")).toString("base64");
    fontCssCache = `@font-face{font-family:Menco;src:url(data:font/otf;base64,${med}) format("opentype");font-weight:400}@font-face{font-family:Menco;src:url(data:font/otf;base64,${bold}) format("opentype");font-weight:700}`;
  } catch {
    fontCssCache = "";
  }
  return fontCssCache;
}

function setupPage() {
  const options = SETUP_PROVIDERS.map(
    ([id, label]) => `<option value="${id}">${label}</option>`,
  ).join("");
  const keyUrls = JSON.stringify(Object.fromEntries(SETUP_PROVIDERS.map(([id, , u]) => [id, u])));
  return (
    "data:text/html;charset=utf-8," +
    encodeURIComponent(`<style>${fontCss()}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(45deg,#facc15,#facc15 24px,#fbbf24 24px,#fbbf24 48px);font-family:Menco,system-ui}
  form{background:#3b82f6;border:4px solid #60a5fa;border-radius:24px;padding:36px 40px;width:460px;box-shadow:0 30px 80px rgba(0,0,0,.25);color:#fff}
  h1{font-size:26px;margin:8px 0 4px;font-weight:700}
  p{color:rgba(255,255,255,.85);margin:0 0 18px;font-size:14px;line-height:1.5}
  label{font-size:14px;font-weight:600}
  select,input{width:100%;padding:12px;margin:6px 0 14px;border-radius:8px;border:0;font-size:15px;font-family:Menco,system-ui;box-sizing:border-box;background:#fff;color:#000}
  a{color:#fff}
  button{width:100%;padding:13px;border:0;border-radius:8px;background:#22c55e;color:#000;font-weight:700;font-size:16px;cursor:pointer;font-family:Menco,system-ui}
  .skip{display:block;text-align:center;margin-top:12px;font-size:13px;color:rgba(255,255,255,.75)}
  .getkey{font-size:12px;float:right}
</style><body>
<form action="studynotes://save">
  <div style="font-size:40px">&#128218;</div>
  <h1>Connect an AI</h1>
  <p>One key powers your tutor. Typical cost: about $1/month of daily studying. Your key stays on this computer.</p>
  <label>Provider</label><br>
  <select name="provider" id="prov">${options}</select><br>
  <div id="keyrow"><label>API key</label>
  <a id="geturl" href="https://openrouter.ai/keys" target="_blank" class="getkey">Get a free key &rarr;</a><br>
  <input name="key" id="key" type="password" placeholder="sk-..."></div>
  <div id="urlrow" style="display:none"><label>Base URL</label><br>
  <input name="baseUrl" id="baseUrl" placeholder="http://localhost:11434/v1"></div>
  <button>Start studying</button>
  <a href="studynotes://skip" class="skip">Skip for now</a>
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
          `<style>${fontCss()}</style><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:repeating-linear-gradient(45deg,#facc15,#facc15 24px,#fbbf24 24px,#fbbf24 48px);font-family:Menco,system-ui"><div style="font-size:64px">&#128218;</div><div style="font-size:22px;font-weight:700;color:#422006">Warming up your study space&hellip;</div></body>`,
        ),
    );

    if (needsSetup()) {
      await runSetup(win);
      win.loadURL(
        "data:text/html;charset=utf-8," +
          encodeURIComponent(
            `<style>${fontCss()}</style><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#facc15;font-family:Menco,system-ui;font-size:20px;font-weight:700;color:#422006">Warming up your study space&hellip;</body>`,
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

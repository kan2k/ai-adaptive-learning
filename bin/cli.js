#!/usr/bin/env node
// Student launcher: `npx <name> [notes-folder]`.
// First run asks for an OpenRouter key (saved to ~/.config/<name>.json),
// then boots the bundled standalone server and opens the browser.
import fs from "fs";
import os from "os";
import path from "path";
import net from "net";
import readline from "readline";
import { spawn, execSync } from "child_process";
import { fileURLToPath } from "url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgName = JSON.parse(
  fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8"),
).name.replace(/^@[^/]+\//, "");
const configDir = path.join(os.homedir(), ".config");
const configPath = path.join(configDir, `${pkgName}.json`);

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(config) {
  // The file holds an API key: owner-only on platforms with POSIX modes.
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  try {
    fs.chmodSync(configPath, 0o600);
  } catch {
    /* Windows ACLs: mode is a no-op there */
  }
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

async function freePort(start) {
  for (let port = start; port < start + 50; port++) {
    const ok = await new Promise((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => resolve(false));
      srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
    });
    if (ok) return port;
  }
  return start;
}

function openBrowser(url) {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  try {
    execSync(cmd, { shell: true, stdio: "ignore" });
  } catch {
    /* the printed URL still works */
  }
}

const studyDir = path.resolve(
  process.argv[2] || process.env.STUDY_DIR || path.join(os.homedir(), "StudyNotes"),
);
fs.mkdirSync(studyDir, { recursive: true });
if (!fs.readdirSync(studyDir).some((f) => !f.startsWith("."))) {
  fs.writeFileSync(
    path.join(studyDir, "welcome.md"),
    "# Welcome\n\nDrop your notes, lecture slides (.pptx), handouts (.docx), PDFs,\nor markdown files into this folder and they become courses.\n",
  );
}

const config = loadConfig();
let key = process.env.OPENROUTER_API_KEY || config.openrouterApiKey;
const ollama = process.env.OLLAMA_BASE_URL || config.ollamaBaseUrl;
if (!key && !ollama) {
  console.log(`\nOne thing before your first study session:`);
  console.log(`get a free API key at https://openrouter.ai/keys`);
  console.log(`(typical cost: about $1/month of daily studying)\n`);
  key = await ask("Paste your OpenRouter key (or press Enter to add it later): ");
  if (key) {
    saveConfig({ ...config, openrouterApiKey: key });
    console.log(`Saved to ${configPath} — you won't be asked again.\n`);
  }
}

const port = await freePort(Number(process.env.PORT) || 3000);
const server = path.join(pkgRoot, "standalone", "server.js");
if (!fs.existsSync(server)) {
  console.error("Bundled server missing — this package was not built correctly.");
  process.exit(1);
}

const child = spawn(process.execPath, [server], {
  env: {
    ...process.env,
    STUDY_DIR: studyDir,
    ...(provider ? { LLM_PROVIDER: provider } : {}),
    ...(key ? { LLM_API_KEY: key } : {}),
    ...(baseUrl ? { LLM_BASE_URL: baseUrl } : {}),
    ...(ollama ? { OLLAMA_BASE_URL: ollama } : {}),
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
  },
  stdio: ["ignore", "pipe", "inherit"],
});

const url = `http://localhost:${port}`;
let opened = false;
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (!opened && String(chunk).includes("Ready")) {
    opened = true;
    console.log(`\n  Studying from: ${studyDir}`);
    console.log(`  Open:          ${url}\n`);
    openBrowser(url);
  }
});
child.on("exit", (code) => process.exit(code ?? 0));

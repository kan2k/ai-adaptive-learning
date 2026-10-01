// Arranges the standalone build for npm packaging: server + static assets
// land in ./standalone so bin/cli.js can boot it with plain node.
import fs from "fs";
import path from "path";

const out = "standalone";
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(".next/standalone", out, { recursive: true });
fs.cpSync(".next/static", path.join(out, ".next/static"), { recursive: true });
if (fs.existsSync("public")) fs.cpSync("public", path.join(out, "public"), { recursive: true });
console.log("standalone package layout ready");

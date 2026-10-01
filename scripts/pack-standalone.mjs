// Arranges the standalone build for npm packaging: server + static assets
// land in ./standalone so bin/cli.js can boot it with plain node.
import fs from "fs";
import path from "path";

const out = "standalone";
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(".next/standalone", out, { recursive: true });
fs.cpSync(".next/static", path.join(out, ".next/static"), { recursive: true });
if (fs.existsSync("public")) fs.cpSync("public", path.join(out, "public"), { recursive: true });
// electron-builder silently strips node_modules dirs inside extraResources,
// so the dependencies travel under a different name and the launchers point
// NODE_PATH at it.
fs.renameSync(path.join(out, "node_modules"), path.join(out, "nmodules"));
console.log("standalone package layout ready");

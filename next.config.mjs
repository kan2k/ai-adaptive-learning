/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output ships a self-contained server in the npm package, so
  // `npx <name>` runs without a build step on the student's machine.
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "chokidar", "pdfjs-dist"],
};

export default nextConfig;

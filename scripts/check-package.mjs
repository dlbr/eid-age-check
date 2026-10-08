import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const packDirectory = mkdtempSync(join(tmpdir(), "eid-age-check-pack-"));
let manifest;
let packedBytes;
try {
  manifest = JSON.parse(execFileSync(pnpm, ["pack", "--json", "--pack-destination", packDirectory], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  }));
  packedBytes = statSync(manifest.filename).size;
} finally {
  rmSync(packDirectory, { recursive: true, force: true });
}
const paths = new Set(manifest.files.map((file) => file.path));
const explicitFiles = packageJson.files.filter((file) => !["dist", "types", "README.md"].includes(file));
const allowed = new Set(["LICENSE", "README.md", "package.json", ...explicitFiles]);
const unexpected = [...paths].filter((path) =>
  !allowed.has(path) && !path.startsWith("dist/") && !path.startsWith("types/"));
const unsafe = [...paths].filter((path) =>
  /(^|\/)(?:node_modules|\.wrangler|\.env(?:\..*)?|\.dev\.vars(?:\..*)?)(?:\/|$)/.test(path)
  && !path.endsWith("/.dev.vars.example"));
const missing = explicitFiles.filter((path) => !paths.has(path));

function exportedPaths(value) {
  if (typeof value === "string") return value.startsWith("./") ? [value.slice(2)] : [];
  if (value && typeof value === "object") return Object.values(value).flatMap(exportedPaths);
  return [];
}

const missingExports = exportedPaths(packageJson.exports).filter((path) => !paths.has(path));
if (unexpected.length || unsafe.length || missing.length || missingExports.length) {
  throw new Error(JSON.stringify({ unexpected, unsafe, missing, missingExports }, null, 2));
}

console.log(`Package check passed: ${manifest.files.length} files, ${packedBytes} packed bytes.`);

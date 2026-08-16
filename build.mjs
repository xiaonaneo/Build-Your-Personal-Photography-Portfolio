import { mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const publishDirectory = join(process.cwd(), "public");
const runtimeFiles = [
  "index.html",
  "admin.html",
  "styles.css",
  "admin.css",
  "script.js",
  "admin.js",
  "admin-auth.js",
  "site-config.js",
  "theme-init.js",
];

rmSync(publishDirectory, { recursive: true, force: true });
mkdirSync(publishDirectory, { recursive: true });

for (const file of runtimeFiles) {
  copyFileSync(join(process.cwd(), file), join(publishDirectory, file));
}

console.log(`Prepared ${runtimeFiles.length} runtime files in ${publishDirectory}`);

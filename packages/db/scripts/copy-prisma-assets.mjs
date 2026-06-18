import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src/generated/prisma/internal");
const destDir = path.join(root, "dist/generated/prisma/internal");

mkdirSync(destDir, { recursive: true });

for (const file of ["query_compiler_fast_bg.js", "query_compiler_fast_bg.wasm"]) {
  cpSync(path.join(srcDir, file), path.join(destDir, file));
}

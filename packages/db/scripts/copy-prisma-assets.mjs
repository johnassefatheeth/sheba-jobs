import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const targets = [
  ["src/generated/prisma-cloudflare/internal", "dist/generated/prisma-cloudflare/internal"],
];

for (const [srcRel, destRel] of targets) {
  const srcDir = path.join(root, srcRel);
  const destDir = path.join(root, destRel);
  mkdirSync(destDir, { recursive: true });
  for (const file of ["query_compiler_fast_bg.js", "query_compiler_fast_bg.wasm"]) {
    cpSync(path.join(srcDir, file), path.join(destDir, file));
  }
}

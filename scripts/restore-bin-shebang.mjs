import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const binPath = fileURLToPath(new URL("../build/src/bin/dynamark.js", import.meta.url));
const shebang = "#!/usr/bin/env node\n";
const content = readFileSync(binPath, "utf8");

if (!content.startsWith(shebang)) {
  writeFileSync(binPath, `${shebang}${content.replace(/^#!.*\n/, "")}`);
}

chmodSync(binPath, 0o755);

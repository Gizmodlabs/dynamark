import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const tsMigrationPath = path.join(currentDir, "../../templates/ts/migration.template");
export const cjsMigrationPath = path.join(
  currentDir,
  "../../templates/commonjs/migration.template",
);
export const mjsMigrationPath = path.join(currentDir, "../../templates/esm/migration.template");

export const mjsExtension = ".mjs";
export const tsExtension = ".ts";
export const cjsExtension = ".cjs";

export function targetConfigPath() {
  return path.join(process.cwd(), "config.json");
}

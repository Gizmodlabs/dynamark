import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const tsMigrationPath = resolveTemplatePath("ts", "migration.template");
export const cjsMigrationPath = resolveTemplatePath("commonjs", "migration.template");
export const mjsMigrationPath = resolveTemplatePath("esm", "migration.template");

export const mjsExtension = ".mjs";
export const tsExtension = ".ts";
export const cjsExtension = ".cjs";

export const configFileName = "dynamark.config.json";

export function targetConfigPath() {
  return path.join(process.cwd(), configFileName);
}

function resolveTemplatePath(...parts: string[]) {
  const candidates = [
    path.join(currentDir, "../../templates", ...parts),
    path.join(currentDir, "../templates", ...parts),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

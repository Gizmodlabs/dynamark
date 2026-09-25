import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { getFileLoader, loadMigrationsDir } from "./config.js";
import { configFileName } from "./paths.js";

export const DEFAULT_MIGRATIONS_DIR_NAME = "migrations";

export function resolveMigrationsDirPath() {
  const configuredMigrationsDir = loadMigrationsDir();
  if (path.isAbsolute(configuredMigrationsDir)) {
    return configuredMigrationsDir;
  }

  return path.join(process.cwd(), configuredMigrationsDir);
}

export function isMigrationDirPresent() {
  return existsSync(resolveMigrationsDirPath());
}

export function getFileNamesInMigrationFolder() {
  const migrationsDir = resolveMigrationsDirPath();
  if (!isMigrationDirPresent()) {
    throw new Error(
      `Please ensure migrations directory as specified in ${configFileName} is present`,
    );
  }

  const extension = getFileLoader().configExtension;
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name)
    .sort();
}

export async function loadFilesToBeMigrated(fileName: string) {
  if (!isMigrationDirPresent()) {
    throw new Error(
      `Please ensure migrations directory as specified in ${configFileName} is present`,
    );
  }

  return getFileLoader().loadMigrationFile(path.join(resolveMigrationsDirPath(), fileName));
}

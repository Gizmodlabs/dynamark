import { copyFile } from "node:fs/promises";
import path from "node:path";

import { getFileLoader } from "../env/config.js";
import { isMigrationDirPresent, resolveMigrationsDirPath } from "../env/migrationsDir.js";

export async function create(description: string) {
  if (!description) {
    throw new Error("Please pass a valid description");
  }

  if (!isMigrationDirPresent()) {
    throw new Error("Please ensure migrations directory as specified in config.json is present");
  }

  const migrationsDirPath = resolveMigrationsDirPath();
  const fileLoader = getFileLoader();
  const filename = `${Date.now()}-${description.trim().split(/\s+/).join("_")}${fileLoader.configExtension}`;
  const destination = path.join(migrationsDirPath, filename);
  await copyFile(fileLoader.migrationTemplate, destination);
  return filename;
}

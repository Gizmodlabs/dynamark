import { mkdir } from "node:fs/promises";
import path from "node:path";

import * as config from "../env/config.js";
import * as migrationsDir from "../env/migrationsDir.js";

export async function init() {
  if (config.isConfigFilePresent()) {
    throw new Error("Config file already exist, init step not required");
  }

  config.initializeConfig();
  return mkdir(path.join(process.cwd(), migrationsDir.DEFAULT_MIGRATIONS_DIR_NAME), {
    recursive: true,
  });
}

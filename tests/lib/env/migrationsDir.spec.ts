import { mkdirSync, writeFileSync } from "node:fs";

import {
  getFileNamesInMigrationFolder,
  isMigrationDirPresent,
  loadFilesToBeMigrated,
  resolveMigrationsDirPath,
} from "../../../src/lib/env/migrationsDir.js";
import { withTempCwd } from "../../helpers/tempCwd.js";

describe("migrationsDir", () => {
  it("resolves relative migrations directories from the current working directory", async () => {
    await withTempCwd(() => {
      writeConfig("migrations");

      expect(resolveMigrationsDirPath()).toBe(`${process.cwd()}/migrations`);
    });
  });

  it("lists migration files in deterministic order", async () => {
    await withTempCwd(() => {
      writeConfig("migrations");
      mkdirSync("migrations");
      writeFileSync("migrations/2-second.ts", "");
      writeFileSync("migrations/1-first.ts", "");

      expect(isMigrationDirPresent()).toBe(true);
      expect(getFileNamesInMigrationFolder()).toEqual(["1-first.ts", "2-second.ts"]);
    });
  });

  it("loads TypeScript migration files through the configured loader strategy", async () => {
    await withTempCwd(async () => {
      writeConfig("migrations");
      mkdirSync("migrations");
      writeFileSync(
        "migrations/1-example.ts",
        "export async function up() {} export async function down() {}",
      );

      const migration = await loadFilesToBeMigrated("1-example.ts");

      expect(typeof migration.up).toBe("function");
      expect(typeof migration.down).toBe("function");
    });
  });
});

function writeConfig(migrationsDir: string) {
  writeFileSync(
    "dynamark.config.json",
    JSON.stringify({
      awsConfig: [{ profile: "", region: "us-west-2" }],
      migrationsDir,
      migrationType: "ts",
    }),
  );
}

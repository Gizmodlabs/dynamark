import * as migrationsDb from "../env/migrationsDb.js";
import * as migrationsDir from "../env/migrationsDir.js";
import type { MigrationStatusItem } from "../types.js";

export async function status(profile = "default"): Promise<MigrationStatusItem[]> {
  const ddb = await migrationsDb.getDdb(profile);
  const fileNamesInMigrationFolder = migrationsDir.getFileNamesInMigrationFolder();
  const migrationsLog = await migrationsDb.getAllMigrations(ddb);

  return fileNamesInMigrationFolder.map((fileName) => {
    const fileMigrated = migrationsLog.find((migrated) => migrated.FILE_NAME === fileName);
    return {
      fileName,
      appliedAt: fileMigrated?.APPLIED_AT ?? "PENDING",
    };
  });
}

import * as migrationsDb from "../env/migrationsDb.js";
import * as migrationsDir from "../env/migrationsDir.js";
import type { MigrationStatusItem } from "../types.js";
import { status } from "./status.js";

class MigrationError extends Error {
  migrated?: string[];
}

export async function up(profile = "default") {
  const ddb = await migrationsDb.getDdb(profile);
  if (!(await migrationsDb.doesMigrationsLogDbExists(ddb))) {
    await migrationsDb.configureMigrationsLogDbSchema(ddb);
  }

  const statusItems = await status(profile);
  const pendingItems = statusItems.filter((item) => item.appliedAt === "PENDING");
  const migrated: string[] = [];

  for (const item of pendingItems) {
    await migrateItem(item, migrated);
  }

  return migrated;

  async function migrateItem(item: MigrationStatusItem, migratedItems: string[]) {
    try {
      const migration = await migrationsDir.loadFilesToBeMigrated(item.fileName);
      await migration.up(ddb);
    } catch (error_) {
      const cause = error_ as Error;
      const error = new MigrationError(`Could not migrate up ${item.fileName}: ${cause.message}`);
      error.stack = cause.stack;
      error.migrated = migratedItems;
      throw error;
    }

    const migrationLogItem = {
      fileName: item.fileName,
      appliedAt: new Date().toJSON(),
    };

    try {
      await migrationsDb.addMigrationToMigrationsLogDb(migrationLogItem, ddb);
    } catch (error_) {
      const cause = error_ as Error;
      throw new Error(`Could not update migrationsLogDb: ${cause.message}`);
    }

    migratedItems.push(item.fileName);
  }
}

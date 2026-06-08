import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import * as migrationsDb from "../env/migrationsDb.js";
import * as migrationsDir from "../env/migrationsDir.js";
import type { MigrationStatusItem } from "../types.js";
import { status } from "./status.js";

export async function down(profile = "default", downShift = 1) {
  const downgraded: string[] = [];
  const statusItems = await status(profile);
  const appliedItems = statusItems.filter((item) => item.appliedAt !== "PENDING");
  const ddb = await migrationsDb.getDdb(profile);
  const itemsToRollback = appliedItems
    .slice(-(downShift === 0 ? appliedItems.length : downShift))
    .reverse();

  for (const item of itemsToRollback) {
    await executeDown(ddb, item);
    downgraded.push(item.fileName);
  }

  return downgraded;
}

async function executeDown(ddb: DynamoDBClient, file: MigrationStatusItem) {
  try {
    const migration = await migrationsDir.loadFilesToBeMigrated(file.fileName);
    await migration.down(ddb);
  } catch (error_) {
    const cause = error_ as Error;
    throw new Error(`Could not migrate down ${file.fileName}: ${cause.message}`);
  }

  try {
    await migrationsDb.deleteMigrationFromMigrationsLogDb(file, ddb);
  } catch (error_) {
    const cause = error_ as Error;
    throw new Error(`Could not update migrationsLogDb: ${cause.message}`);
  }
}

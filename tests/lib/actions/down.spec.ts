import { mkdirSync, writeFileSync } from "node:fs";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";

import { down } from "../../../src/lib/actions/down.js";
import * as historyDir from "../../../src/lib/env/historyDir.js";
import * as migrationsDb from "../../../src/lib/env/migrationsDb.js";
import { withTempCwd } from "../../helpers/tempCwd.js";

describe("down", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rolls back the latest applied migrations in reverse order", async () => {
    await withTempCwd(async () => {
      writeConfig();
      mkdirSync("migrations");
      writeFileSync(
        "migrations/1-first.ts",
        "export async function up() {} export async function down() {}",
      );
      writeFileSync(
        "migrations/2-second.ts",
        "export async function up() {} export async function down() {}",
      );
      vi.spyOn(migrationsDb, "getDdb").mockResolvedValue({} as DynamoDBClient);
      vi.spyOn(migrationsDb, "getAllMigrations").mockResolvedValue([
        { FILE_NAME: "1-first.ts", APPLIED_AT: "first" },
        { FILE_NAME: "2-second.ts", APPLIED_AT: "second" },
      ]);
      vi.spyOn(migrationsDb, "deleteMigrationFromMigrationsLogDb").mockResolvedValue({
        $metadata: {},
      });

      await expect(down("default", 0)).resolves.toEqual(["2-second.ts", "1-first.ts"]);

      const runs = historyDir.listRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({
        action: "down",
        profile: "default",
        result: "success",
        files: ["2-second.ts", "1-first.ts"],
      });
    });
  });

  it("records a failed history entry with the rollbacks that completed before the failure", async () => {
    await withTempCwd(async () => {
      writeConfig();
      mkdirSync("migrations");
      writeFileSync(
        "migrations/1-fails.ts",
        'export async function up() {} export async function down() { throw new Error("boom") }',
      );
      writeFileSync(
        "migrations/2-second.ts",
        "export async function up() {} export async function down() {}",
      );
      vi.spyOn(migrationsDb, "getDdb").mockResolvedValue({} as DynamoDBClient);
      vi.spyOn(migrationsDb, "getAllMigrations").mockResolvedValue([
        { FILE_NAME: "1-fails.ts", APPLIED_AT: "first" },
        { FILE_NAME: "2-second.ts", APPLIED_AT: "second" },
      ]);
      vi.spyOn(migrationsDb, "deleteMigrationFromMigrationsLogDb").mockResolvedValue({
        $metadata: {},
      });

      await expect(down("default", 0)).rejects.toThrow("Could not migrate down 1-fails.ts: boom");

      const runs = historyDir.listRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({
        action: "down",
        result: "failed",
        files: ["2-second.ts"],
        error: "Could not migrate down 1-fails.ts: boom",
      });
    });
  });
});

function writeConfig() {
  writeFileSync(
    "dynamark.config.json",
    JSON.stringify({
      awsConfig: [
        {
          profile: "",
          region: "us-west-2",
          accessKeyId: "test",
          secretAccessKey: "test",
        },
      ],
      migrationsDir: "migrations",
      migrationType: "ts",
    }),
  );
}

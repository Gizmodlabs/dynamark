import { mkdirSync, writeFileSync } from "node:fs";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";

import { up } from "../../../src/lib/actions/up.js";
import * as migrationsDb from "../../../src/lib/env/migrationsDb.js";
import { withTempCwd } from "../../helpers/tempCwd.js";

describe("up", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs pending migrations in filename order and stops on the first failed migration", async () => {
    await withTempCwd(async () => {
      writeConfig();
      mkdirSync("migrations");
      writeFileSync(
        "migrations/1-first.ts",
        "export async function up() {} export async function down() {}",
      );
      writeFileSync(
        "migrations/2-fails.ts",
        'export async function up() { throw new Error("boom") } export async function down() {}',
      );
      writeFileSync(
        "migrations/3-never.ts",
        "export async function up() {} export async function down() {}",
      );
      vi.spyOn(migrationsDb, "getDdb").mockResolvedValue({} as DynamoDBClient);
      vi.spyOn(migrationsDb, "doesMigrationsLogDbExists").mockResolvedValue(true);
      vi.spyOn(migrationsDb, "configureMigrationsLogDbSchema").mockResolvedValue(undefined);
      vi.spyOn(migrationsDb, "getAllMigrations").mockResolvedValue([]);
      vi.spyOn(migrationsDb, "addMigrationToMigrationsLogDb").mockResolvedValue({ $metadata: {} });

      await expect(up()).rejects.toMatchObject({
        message: "Could not migrate up 2-fails.ts: boom",
        migrated: ["1-first.ts"],
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

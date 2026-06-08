import { mkdirSync, writeFileSync } from "node:fs";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";

import { down } from "../../../src/lib/actions/down.js";
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
    });
  });
});

function writeConfig() {
  writeFileSync(
    "config.json",
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

import { mkdirSync, writeFileSync } from "node:fs";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";

import { status } from "../../../src/lib/actions/status.js";
import * as migrationsDb from "../../../src/lib/env/migrationsDb.js";
import { withTempCwd } from "../../helpers/tempCwd.js";

describe("status", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("marks unapplied migrations as pending", async () => {
    await withTempCwd(async () => {
      writeConfig();
      mkdirSync("migrations");
      writeFileSync(
        "migrations/1-applied.ts",
        "export async function up() {} export async function down() {}",
      );
      writeFileSync(
        "migrations/2-pending.ts",
        "export async function up() {} export async function down() {}",
      );
      vi.spyOn(migrationsDb, "getDdb").mockResolvedValue({} as DynamoDBClient);
      vi.spyOn(migrationsDb, "getAllMigrations").mockResolvedValue([
        { FILE_NAME: "1-applied.ts", APPLIED_AT: "2026-06-08T00:00:00.000Z" },
      ]);

      const items = await status();

      expect(items).toEqual([
        expect.objectContaining({ fileName: "1-applied.ts", appliedAt: expect.any(String) }),
        { fileName: "2-pending.ts", appliedAt: "PENDING" },
      ]);
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

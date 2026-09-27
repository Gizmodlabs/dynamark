import { mkdirSync, writeFileSync } from "node:fs";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";

import { up } from "../../../src/lib/actions/up.js";
import * as historyDir from "../../../src/lib/env/historyDir.js";
import * as migrationsDb from "../../../src/lib/env/migrationsDb.js";
import { withTempCwd } from "../../helpers/tempCwd.js";

describe("up", () => {
  let lock: { assertHeld: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    lock = { assertHeld: vi.fn(), release: vi.fn(async () => {}) };
    vi.spyOn(migrationsDb, "acquireMigrationLock").mockResolvedValue(
      lock as unknown as migrationsDb.MigrationLock,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("releases the migration lock even when a migration fails", async () => {
    await withTempCwd(async () => {
      writeConfig();
      mkdirSync("migrations");
      writeFileSync(
        "migrations/1-fails.ts",
        'export async function up() { throw new Error("boom") } export async function down() {}',
      );
      vi.spyOn(migrationsDb, "getDdb").mockResolvedValue({} as DynamoDBClient);
      vi.spyOn(migrationsDb, "doesMigrationsLogDbExists").mockResolvedValue(true);
      vi.spyOn(migrationsDb, "getAllMigrations").mockResolvedValue([]);

      await expect(up()).rejects.toThrow("Could not migrate up 1-fails.ts: boom");

      expect(lock.release).toHaveBeenCalledOnce();
    });
  });

  it("runs nothing when another run holds the migration lock", async () => {
    await withTempCwd(async () => {
      writeConfig();
      mkdirSync("migrations");
      writeFileSync(
        "migrations/1-first.ts",
        "export async function up() {} export async function down() {}",
      );
      vi.spyOn(migrationsDb, "getDdb").mockResolvedValue({} as DynamoDBClient);
      vi.spyOn(migrationsDb, "doesMigrationsLogDbExists").mockResolvedValue(true);
      vi.spyOn(migrationsDb, "acquireMigrationLock").mockRejectedValue(new Error("locked"));
      const add = vi.spyOn(migrationsDb, "addMigrationToMigrationsLogDb");

      await expect(up()).rejects.toThrow("locked");

      expect(add).not.toHaveBeenCalled();
    });
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

      const runs = historyDir.listRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({
        action: "up",
        profile: "default",
        result: "failed",
        files: ["1-first.ts"],
        error: "Could not migrate up 2-fails.ts: boom",
      });
    });
  });

  it("records a success history entry listing every migrated file", async () => {
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
      vi.spyOn(migrationsDb, "doesMigrationsLogDbExists").mockResolvedValue(true);
      vi.spyOn(migrationsDb, "getAllMigrations").mockResolvedValue([]);
      vi.spyOn(migrationsDb, "addMigrationToMigrationsLogDb").mockResolvedValue({ $metadata: {} });

      await expect(up()).resolves.toEqual(["1-first.ts", "2-second.ts"]);

      const runs = historyDir.listRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({
        idx: 1,
        action: "up",
        result: "success",
        files: ["1-first.ts", "2-second.ts"],
      });
      expect(runs[0].runId).toMatch(/^0001_\d{8}T\d{9}Z_up$/);
    });
  });

  it("does not record a history entry when there is nothing to migrate", async () => {
    await withTempCwd(async () => {
      writeConfig();
      mkdirSync("migrations");
      vi.spyOn(migrationsDb, "getDdb").mockResolvedValue({} as DynamoDBClient);
      vi.spyOn(migrationsDb, "doesMigrationsLogDbExists").mockResolvedValue(true);
      vi.spyOn(migrationsDb, "getAllMigrations").mockResolvedValue([]);

      await expect(up()).resolves.toEqual([]);

      expect(historyDir.listRuns()).toEqual([]);
    });
  });

  it("still reports the migration result when history recording fails", async () => {
    await withTempCwd(async () => {
      writeConfig();
      mkdirSync("migrations");
      writeFileSync(
        "migrations/1-first.ts",
        "export async function up() {} export async function down() {}",
      );
      vi.spyOn(migrationsDb, "getDdb").mockResolvedValue({} as DynamoDBClient);
      vi.spyOn(migrationsDb, "doesMigrationsLogDbExists").mockResolvedValue(true);
      vi.spyOn(migrationsDb, "getAllMigrations").mockResolvedValue([]);
      vi.spyOn(migrationsDb, "addMigrationToMigrationsLogDb").mockResolvedValue({ $metadata: {} });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mkdirSync("migrations/history", { recursive: true });
      writeFileSync("migrations/history/_journal.json", "{ not json");

      await expect(up()).resolves.toEqual(["1-first.ts"]);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Could not record migration history"),
      );
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

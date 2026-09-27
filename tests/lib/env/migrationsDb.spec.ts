import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  CreateTableCommand,
  DeleteItemCommand,
  DescribeTableCommand,
  type DynamoDBClient,
  PutItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";

import {
  addMigrationToMigrationsLogDb,
  configureMigrationsLogDbSchema,
  deleteMigrationFromMigrationsLogDb,
  doesMigrationsLogDbExists,
  getAllMigrations,
  getDdb,
  MigrationLogRepository,
} from "../../../src/lib/env/migrationsDb.js";
import { withTempCwd } from "../../helpers/tempCwd.js";

describe("migrationsDb", () => {
  it("creates the migration log table using on-demand billing", async () => {
    const sentCommands: unknown[] = [];
    const ddb = fakeDdb((command) => {
      sentCommands.push(command);
      return {};
    });

    await configureMigrationsLogDbSchema(ddb);

    const createCommand = sentCommands.find((command) => command instanceof CreateTableCommand);
    expect(createCommand).toBeInstanceOf(CreateTableCommand);
    expect((createCommand as CreateTableCommand).input).toMatchObject({
      BillingMode: "PAY_PER_REQUEST",
      TableName: "MIGRATIONS_LOG_DB",
    });
  });

  it("uses AWS SDK v3 commands for migration log writes and deletes", async () => {
    const sentCommands: unknown[] = [];
    const ddb = fakeDdb((command) => {
      sentCommands.push(command);
      return {};
    });

    await addMigrationToMigrationsLogDb({ fileName: "1-add.ts", appliedAt: "2026-06-08" }, ddb);
    await deleteMigrationFromMigrationsLogDb(
      { fileName: "1-add.ts", appliedAt: "2026-06-08" },
      ddb,
    );

    expect(sentCommands[0]).toBeInstanceOf(PutItemCommand);
    expect(sentCommands[1]).toBeInstanceOf(DeleteItemCommand);
  });

  it("returns false when the migration log table does not exist", async () => {
    const ddb = fakeDdb(() => {
      throw new Error("ResourceNotFoundException");
    });

    await expect(doesMigrationsLogDbExists(ddb)).resolves.toBe(false);
  });

  it("scans every migration log page", async () => {
    const ddb = fakeDdb((command) => {
      if (command instanceof ScanCommand && !command.input.ExclusiveStartKey) {
        return {
          Items: [{ FILE_NAME: { S: "1.ts" }, APPLIED_AT: { S: "first" } }],
          LastEvaluatedKey: { FILE_NAME: { S: "1.ts" }, APPLIED_AT: { S: "first" } },
        };
      }

      return {
        Items: [{ FILE_NAME: { S: "2.ts" }, APPLIED_AT: { S: "second" } }],
      };
    });

    await expect(getAllMigrations(ddb)).resolves.toEqual([
      { FILE_NAME: "1.ts", APPLIED_AT: "first" },
      { FILE_NAME: "2.ts", APPLIED_AT: "second" },
    ]);
  });

  it("builds a DynamoDBClient from the selected config profile", async () => {
    await withTempCwd(async () => {
      writeFileSync(
        "dynamark.config.json",
        JSON.stringify({
          awsConfig: [
            { profile: "", region: "us-east-1", accessKeyId: "default", secretAccessKey: "secret" },
            { profile: "dev", region: "us-west-2", accessKeyId: "dev", secretAccessKey: "secret" },
          ],
          migrationsDir: "migrations",
          migrationType: "ts",
        }),
      );

      const ddb = await getDdb("dev");

      await expect(ddb.config.region()).resolves.toBe("us-west-2");
    });
  });

  it("tolerates another run creating the migration log table first", async () => {
    const ddb = fakeDdb((command) => {
      if (command instanceof CreateTableCommand) {
        throw Object.assign(new Error("Table already exists"), { name: "ResourceInUseException" });
      }
      return { Table: { TableStatus: "ACTIVE" } };
    });

    await expect(configureMigrationsLogDbSchema(ddb)).resolves.toBeUndefined();
  });

  describe("credentials when the config has no keys", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("uses env var credentials for the default profile, as CI runners provide them", async () => {
      await withTempCwd(async () => {
        writeProfileConfig("");
        isolateSharedAwsFiles("/nonexistent/credentials");
        vi.stubEnv("AWS_ACCESS_KEY_ID", "env-key");
        vi.stubEnv("AWS_SECRET_ACCESS_KEY", "env-secret");

        const ddb = await getDdb();

        await expect(ddb.config.credentials()).resolves.toMatchObject({ accessKeyId: "env-key" });
      });
    });

    it("uses a named profile from the shared credentials file", async () => {
      await withTempCwd(async () => {
        writeProfileConfig("dev");
        writeFileSync(
          "credentials",
          "[dev]\naws_access_key_id = dev-key\naws_secret_access_key = dev-secret\n",
        );
        isolateSharedAwsFiles(path.join(process.cwd(), "credentials"));

        const ddb = await getDdb("dev");

        await expect(ddb.config.credentials()).resolves.toMatchObject({ accessKeyId: "dev-key" });
      });
    });
  });

  it("exposes a repository adapter for migration log storage", async () => {
    const sentCommands: unknown[] = [];
    const repository = new MigrationLogRepository(
      fakeDdb((command) => {
        sentCommands.push(command);
        return {};
      }),
    );

    await repository.add({ fileName: "1.ts", appliedAt: "now" });
    await repository.delete({ fileName: "1.ts", appliedAt: "now" });

    expect(sentCommands[0]).toBeInstanceOf(PutItemCommand);
    expect(sentCommands[1]).toBeInstanceOf(DeleteItemCommand);
  });
});

function writeProfileConfig(profile: string) {
  writeFileSync(
    "dynamark.config.json",
    JSON.stringify({
      awsConfig: [{ profile, region: "us-west-2" }],
      migrationsDir: "migrations",
      migrationType: "ts",
    }),
  );
}

function isolateSharedAwsFiles(credentialsFile: string) {
  vi.stubEnv("AWS_PROFILE", undefined);
  vi.stubEnv("AWS_SHARED_CREDENTIALS_FILE", credentialsFile);
  vi.stubEnv("AWS_CONFIG_FILE", "/nonexistent/config");
}

function fakeDdb(handler: (command: unknown) => unknown): DynamoDBClient {
  return {
    send: vi.fn(async (command: unknown) => {
      if (command instanceof DescribeTableCommand) {
        return handler(command);
      }

      return handler(command);
    }),
  } as unknown as DynamoDBClient;
}

import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";

import {
  acquireMigrationLock,
  configureMigrationsLogDbSchema,
  getAllMigrations,
  MIGRATIONS_LOCK_KEY,
  MIGRATIONS_LOG_TABLE_NAME,
  MigrationLock,
} from "../../../src/lib/env/migrationsDb.js";

const require = createRequire(import.meta.url);
const lockKey = {
  FILE_NAME: { S: MIGRATIONS_LOCK_KEY },
  APPLIED_AT: { S: MIGRATIONS_LOCK_KEY },
};

describe("MigrationLock", () => {
  const dynaliteServer = require("dynalite")({ createTableMs: 0 });
  let ddb: DynamoDBClient;

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      dynaliteServer.listen(0, "127.0.0.1", (error: Error | undefined) =>
        error ? reject(error) : resolve(),
      );
    });
    const { port } = dynaliteServer.address() as AddressInfo;
    ddb = new DynamoDBClient({
      endpoint: `http://127.0.0.1:${port}`,
      region: "local",
      credentials: { accessKeyId: "local", secretAccessKey: "local" },
    });
    await configureMigrationsLogDbSchema(ddb);
  });

  afterEach(async () => {
    await ddb.send(new DeleteItemCommand({ TableName: MIGRATIONS_LOG_TABLE_NAME, Key: lockKey }));
  });

  afterAll(async () => {
    ddb.destroy();
    await new Promise<void>((resolve) => dynaliteServer.close(() => resolve()));
  });

  it("lets only one run hold the lock at a time", async () => {
    const first = await acquireMigrationLock(ddb);

    await expect(acquireMigrationLock(ddb)).rejects.toThrow(
      "Another dynamark run holds the migration lock",
    );

    await first.release();
    const second = await acquireMigrationLock(ddb);
    await second.release();
  });

  it("lets a new run take over a lock left behind by a crashed run", async () => {
    await putLockRow("crashed-run", Date.now() - 1);

    const lock = await acquireMigrationLock(ddb);

    await expect(getLockOwner()).resolves.not.toBe("crashed-run");
    await lock.release();
  });

  it("keeps the lease alive past its duration while the run is in progress", async () => {
    const lock = new MigrationLock(ddb, MIGRATIONS_LOG_TABLE_NAME, 600);
    await lock.acquire();

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await expect(acquireMigrationLock(ddb)).rejects.toThrow("holds the migration lock");
    expect(() => lock.assertHeld()).not.toThrow();
    await lock.release();
  });

  it("notices a takeover and does not release the other run's lock", async () => {
    const lock = new MigrationLock(ddb, MIGRATIONS_LOG_TABLE_NAME, 300);
    await lock.acquire();

    await putLockRow("other-run", Date.now() + 60_000);

    await vi.waitFor(() => expect(() => lock.assertHeld()).toThrow("Lost the migration lock"));
    await lock.release();
    await expect(getLockOwner()).resolves.toBe("other-run");
  });

  it("does not list the lock row as an applied migration", async () => {
    const lock = await acquireMigrationLock(ddb);

    await expect(getAllMigrations(ddb)).resolves.toEqual([]);

    await lock.release();
  });

  async function putLockRow(owner: string, expiresAt: number) {
    await ddb.send(
      new PutItemCommand({
        TableName: MIGRATIONS_LOG_TABLE_NAME,
        Item: {
          ...lockKey,
          LOCK_OWNER: { S: owner },
          LOCK_EXPIRES_AT: { N: String(expiresAt) },
        },
      }),
    );
  }

  async function getLockOwner() {
    const response = await ddb.send(
      new GetItemCommand({ TableName: MIGRATIONS_LOG_TABLE_NAME, Key: lockKey }),
    );
    return response.Item?.LOCK_OWNER?.S;
  }
});

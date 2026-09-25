import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import {
  CreateTableCommand,
  DeleteItemCommand,
  DynamoDBClient,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";

import { create } from "../../../src/lib/actions/create.js";
import { down } from "../../../src/lib/actions/down.js";
import { history } from "../../../src/lib/actions/history.js";
import { init } from "../../../src/lib/actions/init.js";
import { status } from "../../../src/lib/actions/status.js";
import { up } from "../../../src/lib/actions/up.js";
import { getAllMigrations } from "../../../src/lib/env/migrationsDb.js";
import { withTempCwd } from "../../helpers/tempCwd.js";

const require = createRequire(import.meta.url);

describe("dynamark integration", () => {
  const dynalite = require("dynalite");
  const dynaliteServer = dynalite();
  let endpoint: string;

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      dynaliteServer.once("error", reject);
      dynaliteServer.listen(0, "127.0.0.1", (error: Error | undefined) => {
        if (error) {
          reject(error);
          return;
        }

        const address = dynaliteServer.address() as AddressInfo;
        endpoint = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => dynaliteServer.close(() => resolve()));
  });

  it.each([
    ["ts", ".ts", tsMigration],
    ["mjs", ".mjs", mjsMigration],
    ["cjs", ".cjs", cjsMigration],
  ])("runs init -> create -> up -> down for %s migrations", async (migrationType, extension, body) => {
    await withTempCwd(async () => {
      await init();
      writeConfig(migrationType, endpoint);

      const ddb = buildLocalClient(endpoint);
      await recreateCustomerTable(ddb);

      const first = await create("first");
      const second = await create("second");
      writeFileSync(`migrations/${first}`, body("customer-1"));
      writeFileSync(`migrations/${second}`, body("customer-2"));

      expect(first.endsWith(extension)).toBe(true);
      expect(second.endsWith(extension)).toBe(true);

      await expect(up()).resolves.toEqual([first, second]);
      await expect(scanCustomerIds(ddb)).resolves.toEqual(["customer-1", "customer-2"]);

      const itemsAfterUp = await status();
      expect(itemsAfterUp).toEqual([
        expect.objectContaining({ fileName: first, appliedAt: expect.any(String) }),
        expect.objectContaining({ fileName: second, appliedAt: expect.any(String) }),
      ]);

      await expect(down("default", 0)).resolves.toEqual([second, first]);
      await expect(scanCustomerIds(ddb)).resolves.toEqual([]);

      const runs = await history();
      expect(runs).toHaveLength(2);
      expect(runs[0]).toMatchObject({
        idx: 1,
        action: "up",
        result: "success",
        files: [first, second],
      });
      expect(runs[1]).toMatchObject({
        idx: 2,
        action: "down",
        result: "success",
        files: [second, first],
      });
      expect(runs[0].runId).toMatch(/^0001_\d{8}T\d{9}Z_up$/);
      expect(runs[1].runId).toMatch(/^0002_\d{8}T\d{9}Z_down$/);
    });
  });

  it("applies each migration once when two up runs start at the same time", async () => {
    await withTempCwd(async () => {
      await init();
      writeConfig("ts", endpoint);

      const ddb = buildLocalClient(endpoint);
      await recreateCustomerTable(ddb);
      const fileName = await create("concurrent");
      writeFileSync(`migrations/${fileName}`, tsMigration("customer-concurrent"));

      const results = await Promise.allSettled([up(), up()]);

      const applied = results.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      );
      const errors = results.flatMap((result) =>
        result.status === "rejected" ? [String(result.reason)] : [],
      );
      expect(applied).toEqual([fileName]);
      for (const error of errors) {
        expect(error).toContain("holds the migration lock");
      }
      const logRows = await getAllMigrations(ddb);
      expect(logRows.map((row) => row.FILE_NAME)).toEqual([fileName]);

      await down("default", 0);
    });
  });
});

function writeConfig(migrationType: string, endpoint: string) {
  writeFileSync(
    "dynamark.config.json",
    JSON.stringify({
      awsConfig: [
        {
          profile: "",
          region: "local",
          endpoint,
          accessKeyId: "local",
          secretAccessKey: "local",
        },
      ],
      migrationsDir: "migrations",
      migrationType,
    }),
  );
  mkdirSync("migrations", { recursive: true });
}

function buildLocalClient(endpoint: string) {
  return new DynamoDBClient({
    endpoint,
    region: "local",
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
    },
  });
}

async function recreateCustomerTable(ddb: DynamoDBClient) {
  try {
    await ddb.send(
      new DeleteItemCommand({ TableName: "CUSTOMER", Key: { CUSTOMER_ID: { S: "noop" } } }),
    );
  } catch {
    // Ignore missing table/item. The next create call owns test setup.
  }

  try {
    await ddb.send(
      new CreateTableCommand({
        TableName: "CUSTOMER",
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [{ AttributeName: "CUSTOMER_ID", AttributeType: "S" }],
        KeySchema: [{ AttributeName: "CUSTOMER_ID", KeyType: "HASH" }],
      }),
    );
  } catch {
    // Dynalite keeps state per server. If the table already exists, reuse it after cleanup.
  }
}

async function scanCustomerIds(ddb: DynamoDBClient) {
  const response = await ddb.send(new ScanCommand({ TableName: "CUSTOMER" }));
  return (response.Items ?? [])
    .map((item) => item.CUSTOMER_ID?.S ?? "")
    .filter(Boolean)
    .sort();
}

function tsMigration(customerId: string) {
  return `
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function up(ddb: DynamoDBClient): Promise<void> {
  await ddb.send(new PutItemCommand({
    TableName: "CUSTOMER",
    Item: { CUSTOMER_ID: { S: "${customerId}" } }
  }));
}

export async function down(ddb: DynamoDBClient): Promise<void> {
  await ddb.send(new DeleteItemCommand({
    TableName: "CUSTOMER",
    Key: { CUSTOMER_ID: { S: "${customerId}" } }
  }));
}
`;
}

function mjsMigration(customerId: string) {
  return `
import { DeleteItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function up(ddb) {
  await ddb.send(new PutItemCommand({
    TableName: "CUSTOMER",
    Item: { CUSTOMER_ID: { S: "${customerId}" } }
  }));
}

export async function down(ddb) {
  await ddb.send(new DeleteItemCommand({
    TableName: "CUSTOMER",
    Key: { CUSTOMER_ID: { S: "${customerId}" } }
  }));
}
`;
}

function cjsMigration(customerId: string) {
  return `
const { DeleteItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");

module.exports = {
  async up(ddb) {
    await ddb.send(new PutItemCommand({
      TableName: "CUSTOMER",
      Item: { CUSTOMER_ID: { S: "${customerId}" } }
    }));
  },

  async down(ddb) {
    await ddb.send(new DeleteItemCommand({
      TableName: "CUSTOMER",
      Key: { CUSTOMER_ID: { S: "${customerId}" } }
    }));
  }
};
`;
}

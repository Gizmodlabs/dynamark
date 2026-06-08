import { writeFileSync } from "node:fs";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";

import { create } from "../../../src/lib/actions/create.js";
import { down } from "../../../src/lib/actions/down.js";
import { init } from "../../../src/lib/actions/init.js";
import { status } from "../../../src/lib/actions/status.js";
import { up } from "../../../src/lib/actions/up.js";
import { MIGRATIONS_LOG_TABLE_NAME } from "../../../src/lib/env/migrationsDb.js";
import { withTempCwd } from "../../helpers/tempCwd.js";

const runDynamoDbLocalSmoke = process.env.DYNAMARK_TEST_DDB_LOCAL === "1";
const describeDynamoDbLocal = runDynamoDbLocalSmoke ? describe : describe.skip;
const endpoint = process.env.DYNAMARK_DDB_LOCAL_ENDPOINT ?? "http://localhost:8000";
const testTableName = "DYNAMARK_LOCAL_TEST";

describeDynamoDbLocal("dynamark with Docker DynamoDB Local", () => {
  const ddb = new DynamoDBClient({
    endpoint,
    region: "us-west-2",
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
    },
  });

  beforeAll(async () => {
    await assertDynamoDbLocalIsReachable(ddb);
    await deleteTableIfExists(ddb, MIGRATIONS_LOG_TABLE_NAME);
    await recreateTestTable(ddb);
  });

  afterAll(async () => {
    await deleteTableIfExists(ddb, testTableName);
    await deleteTableIfExists(ddb, MIGRATIONS_LOG_TABLE_NAME);
    ddb.destroy();
  });

  it("runs init -> create -> up -> status -> down against DynamoDB Local", async () => {
    await withTempCwd(async () => {
      await init();
      writeLocalConfig();

      const fileName = await create("local smoke");
      writeFileSync(`migrations/${fileName}`, migrationBody("local-smoke-1"));

      await expect(up()).resolves.toEqual([fileName]);
      await expect(scanIds(ddb)).resolves.toEqual(["local-smoke-1"]);

      await expect(status()).resolves.toEqual([
        expect.objectContaining({ fileName, appliedAt: expect.any(String) }),
      ]);
      await expect(scanMigrationLogFiles(ddb)).resolves.toEqual([fileName]);

      await expect(down("default", 0)).resolves.toEqual([fileName]);
      await expect(scanIds(ddb)).resolves.toEqual([]);
    });
  });
});

function writeLocalConfig() {
  writeFileSync(
    "dynamark.config.json",
    JSON.stringify({
      awsConfig: [
        {
          profile: "",
          region: "us-west-2",
          endpoint,
          accessKeyId: "local",
          secretAccessKey: "local",
        },
      ],
      migrationsDir: "migrations",
      migrationType: "ts",
    }),
  );
}

function migrationBody(id: string) {
  return `
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function up(ddb: DynamoDBClient): Promise<void> {
  await ddb.send(new PutItemCommand({
    TableName: "${testTableName}",
    Item: { id: { S: "${id}" } }
  }));
}

export async function down(ddb: DynamoDBClient): Promise<void> {
  await ddb.send(new DeleteItemCommand({
    TableName: "${testTableName}",
    Key: { id: { S: "${id}" } }
  }));
}
`;
}

async function recreateTestTable(ddb: DynamoDBClient) {
  await deleteTableIfExists(ddb, testTableName);
  await ddb.send(
    new CreateTableCommand({
      TableName: testTableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    }),
  );
}

async function deleteTableIfExists(ddb: DynamoDBClient, tableName: string) {
  try {
    await ddb.send(new DeleteTableCommand({ TableName: tableName }));
  } catch (error) {
    if (!isMissingTable(error)) {
      throw error;
    }
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await ddb.send(new DescribeTableCommand({ TableName: tableName }));
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      if (isMissingTable(error)) {
        return;
      }
      throw error;
    }
  }

  throw new Error(`Timed out waiting for ${tableName} to be deleted`);
}

async function assertDynamoDbLocalIsReachable(ddb: DynamoDBClient) {
  try {
    await ddb.send(new ScanCommand({ TableName: "__dynamark_connection_check__" }));
  } catch (error) {
    if (isMissingTable(error)) {
      return;
    }

    throw new Error(
      `DynamoDB Local is not reachable at ${endpoint}. Start it with: docker run -d -p 8000:8000 --name local-dynamodb amazon/dynamodb-local`,
      { cause: error },
    );
  }
}

async function scanIds(ddb: DynamoDBClient) {
  const response = await ddb.send(new ScanCommand({ TableName: testTableName }));
  return (response.Items ?? [])
    .map((item) => item.id?.S ?? "")
    .filter(Boolean)
    .sort();
}

async function scanMigrationLogFiles(ddb: DynamoDBClient) {
  const response = await ddb.send(new ScanCommand({ TableName: MIGRATIONS_LOG_TABLE_NAME }));
  return (response.Items ?? [])
    .map((item) => item.FILE_NAME?.S ?? "")
    .filter(Boolean)
    .sort();
}

function isMissingTable(error: unknown) {
  return (
    error instanceof ResourceNotFoundException ||
    (error instanceof Error && error.name === "ResourceNotFoundException")
  );
}

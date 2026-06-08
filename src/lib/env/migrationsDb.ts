import {
  type AttributeValue,
  CreateTableCommand,
  DeleteItemCommand,
  DescribeTableCommand,
  DynamoDBClient,
  type DynamoDBClientConfig,
  PutItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { fromIni } from "@aws-sdk/credential-provider-ini";

import type { AwsProfileConfig, MigrationLogItem, RawMigrationLogItem } from "../types.js";
import * as config from "./config.js";

export const MIGRATIONS_LOG_TABLE_NAME = "MIGRATIONS_LOG_DB";

export async function getDdb(profile = "default") {
  const profileConfig = getProfileConfig(profile, config.loadAWSConfig());

  if (!profileConfig?.region) {
    throw new Error(`Please provide region for profile:${profile}`);
  }

  const clientConfig: DynamoDBClientConfig = {
    region: profileConfig.region,
  };

  if (profileConfig.endpoint) {
    clientConfig.endpoint = profileConfig.endpoint;
  }

  if (profileConfig.accessKeyId && profileConfig.secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: profileConfig.accessKeyId,
      secretAccessKey: profileConfig.secretAccessKey,
    };
  } else {
    clientConfig.credentials = fromIni({ profile });
  }

  return new DynamoDBClient(clientConfig);
}

export class MigrationLogRepository {
  constructor(
    private readonly ddb: DynamoDBClient,
    private readonly tableName = MIGRATIONS_LOG_TABLE_NAME,
  ) {}

  async createTable() {
    await this.ddb.send(
      new CreateTableCommand({
        AttributeDefinitions: [
          {
            AttributeName: "FILE_NAME",
            AttributeType: "S",
          },
          {
            AttributeName: "APPLIED_AT",
            AttributeType: "S",
          },
        ],
        KeySchema: [
          {
            AttributeName: "FILE_NAME",
            KeyType: "HASH",
          },
          {
            AttributeName: "APPLIED_AT",
            KeyType: "RANGE",
          },
        ],
        BillingMode: "PAY_PER_REQUEST",
        TableName: this.tableName,
        StreamSpecification: {
          StreamEnabled: false,
        },
      }),
    );

    await this.waitUntilActive();
  }

  async add(item: MigrationLogItem) {
    return this.ddb.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: {
          FILE_NAME: { S: item.fileName },
          APPLIED_AT: { S: item.appliedAt },
        },
      }),
    );
  }

  async delete(item: MigrationLogItem) {
    return this.ddb.send(
      new DeleteItemCommand({
        TableName: this.tableName,
        Key: {
          FILE_NAME: { S: item.fileName },
          APPLIED_AT: { S: item.appliedAt },
        },
      }),
    );
  }

  async exists() {
    try {
      await this.ddb.send(
        new DescribeTableCommand({
          TableName: this.tableName,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async listAll(): Promise<RawMigrationLogItem[]> {
    const migrations: RawMigrationLogItem[] = [];
    let exclusiveStartKey: Record<string, AttributeValue> | undefined;

    do {
      const response = await this.ddb.send(
        new ScanCommand({
          TableName: this.tableName,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );

      migrations.push(
        ...(response.Items ?? []).map((item) => {
          return {
            FILE_NAME: item.FILE_NAME?.S,
            APPLIED_AT: item.APPLIED_AT?.S,
          };
        }),
      );

      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return migrations;
  }

  private async waitUntilActive() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await this.ddb.send(
        new DescribeTableCommand({
          TableName: this.tableName,
        }),
      );

      if (!response.Table?.TableStatus || response.Table.TableStatus === "ACTIVE") {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Timed out waiting for table ${this.tableName} to become active`);
  }
}

export async function configureMigrationsLogDbSchema(ddb: DynamoDBClient) {
  return new MigrationLogRepository(ddb).createTable();
}

export async function addMigrationToMigrationsLogDb(item: MigrationLogItem, ddb: DynamoDBClient) {
  return new MigrationLogRepository(ddb).add(item);
}

export async function deleteMigrationFromMigrationsLogDb(
  item: MigrationLogItem,
  ddb: DynamoDBClient,
) {
  return new MigrationLogRepository(ddb).delete(item);
}

export async function doesMigrationsLogDbExists(ddb: DynamoDBClient) {
  return new MigrationLogRepository(ddb).exists();
}

export async function getAllMigrations(ddb: DynamoDBClient) {
  return new MigrationLogRepository(ddb).listAll();
}

function getProfileConfig(inputProfile: string, awsConfig: AwsProfileConfig[]) {
  return awsConfig.find((profileConfig) => {
    return (
      profileConfig.profile === inputProfile ||
      (!profileConfig.profile && inputProfile === "default")
    );
  });
}

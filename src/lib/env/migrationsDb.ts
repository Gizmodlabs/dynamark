import { randomUUID } from "node:crypto";
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

import type { AwsProfileConfig, MigrationLogItem, RawMigrationLogItem } from "../types.js";
import * as config from "./config.js";

export const MIGRATIONS_LOG_TABLE_NAME = "MIGRATIONS_LOG_DB";
export const MIGRATIONS_LOCK_KEY = "__DYNAMARK_LOCK__";
export const MIGRATIONS_LOCK_LEASE_MS = 60_000;

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
  } else if (profile !== "default") {
    // An explicit profile makes the SDK skip env var credentials, so only pass non-default ones.
    clientConfig.profile = profile;
  }

  return new DynamoDBClient(clientConfig);
}

export class MigrationLogRepository {
  constructor(
    private readonly ddb: DynamoDBClient,
    private readonly tableName = MIGRATIONS_LOG_TABLE_NAME,
  ) {}

  async createTable() {
    try {
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
    } catch (error) {
      if (!isErrorNamed(error, "ResourceInUseException")) {
        throw error;
      }
    }

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
        ...(response.Items ?? [])
          .filter((item) => item.FILE_NAME?.S !== MIGRATIONS_LOCK_KEY)
          .map((item) => {
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

/**
 * Lease-based lock stored as a row in the migration log table. A heartbeat keeps
 * the lease alive during long migrations; a crashed run's lock expires after one lease.
 */
export class MigrationLock {
  private readonly owner = randomUUID();
  private readonly key = {
    FILE_NAME: { S: MIGRATIONS_LOCK_KEY },
    APPLIED_AT: { S: MIGRATIONS_LOCK_KEY },
  };
  private heartbeat?: NodeJS.Timeout;
  private lost = false;
  private expiresAt = 0;

  constructor(
    private readonly ddb: DynamoDBClient,
    private readonly tableName = MIGRATIONS_LOG_TABLE_NAME,
    private readonly leaseMs = MIGRATIONS_LOCK_LEASE_MS,
  ) {}

  async acquire() {
    const now = Date.now();
    try {
      await this.ddb.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: this.lockItem(now + this.leaseMs),
          ConditionExpression: "attribute_not_exists(FILE_NAME) OR LOCK_EXPIRES_AT < :now",
          ExpressionAttributeValues: { ":now": { N: String(now) } },
        }),
      );
      this.expiresAt = now + this.leaseMs;
    } catch (error) {
      if (isErrorNamed(error, "ConditionalCheckFailedException")) {
        throw new Error(
          `Another dynamark run holds the migration lock. Wait for it to finish; a lock left by a crashed run expires within ${this.leaseMs / 1000} seconds.`,
        );
      }
      throw error;
    }

    this.heartbeat = setInterval(() => void this.renew(), this.leaseMs / 3);
    this.heartbeat.unref();
  }

  assertHeld() {
    if (this.lost || Date.now() >= this.expiresAt) {
      throw new Error(
        "Lost the migration lock (another run took it, or renewals failed for a full lease); stopping before the next migration.",
      );
    }
  }

  async release() {
    clearInterval(this.heartbeat);
    try {
      await this.ddb.send(
        new DeleteItemCommand({
          TableName: this.tableName,
          Key: this.key,
          ConditionExpression: "LOCK_OWNER = :owner",
          ExpressionAttributeValues: { ":owner": { S: this.owner } },
        }),
      );
    } catch (error) {
      if (!isErrorNamed(error, "ConditionalCheckFailedException")) {
        console.warn(`Could not release migration lock: ${(error as Error).message}`);
      }
    }
  }

  // Renews with PutItem rather than UpdateItem so the lock needs no IAM action
  // beyond what the migration log already uses.
  private async renew() {
    const expiresAt = Date.now() + this.leaseMs;
    try {
      await this.ddb.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: this.lockItem(expiresAt),
          ConditionExpression: "LOCK_OWNER = :owner",
          ExpressionAttributeValues: { ":owner": { S: this.owner } },
        }),
      );
      this.expiresAt = expiresAt;
    } catch (error) {
      if (isErrorNamed(error, "ConditionalCheckFailedException")) {
        this.lost = true;
      } else {
        console.warn(`Could not renew migration lock: ${(error as Error).message}`);
      }
    }
  }

  private lockItem(expiresAt: number) {
    return {
      ...this.key,
      LOCK_OWNER: { S: this.owner },
      LOCK_EXPIRES_AT: { N: String(expiresAt) },
    };
  }
}

export async function acquireMigrationLock(ddb: DynamoDBClient) {
  const lock = new MigrationLock(ddb);
  await lock.acquire();
  return lock;
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

function isErrorNamed(error: unknown, name: string) {
  return error instanceof Error && error.name === name;
}

function getProfileConfig(inputProfile: string, awsConfig: AwsProfileConfig[]) {
  return awsConfig.find((profileConfig) => {
    return (
      profileConfig.profile === inputProfile ||
      (!profileConfig.profile && inputProfile === "default")
    );
  });
}

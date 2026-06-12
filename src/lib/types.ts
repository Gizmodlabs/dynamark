import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export interface AwsProfileConfig {
  profile?: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface DynamarkConfig {
  awsConfig: AwsProfileConfig[];
  migrationsDir: string;
  migrationType: string;
  historyDir?: string;
}

export interface Migration {
  up(ddb: DynamoDBClient): Promise<void>;
  down(ddb: DynamoDBClient): Promise<void>;
}

export interface MigrationStatusItem {
  fileName: string;
  appliedAt: string;
}

export interface MigrationLogItem {
  fileName: string;
  appliedAt: string;
}

export interface RawMigrationLogItem {
  FILE_NAME?: string;
  APPLIED_AT?: string;
}

export type MigrationRunAction = "up" | "down";

export type MigrationRunResult = "success" | "failed";

export interface MigrationRunRecord {
  idx: number;
  runId: string;
  action: MigrationRunAction;
  profile: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  result: MigrationRunResult;
  files: string[];
  error?: string;
}

export interface HistoryJournal {
  version: number;
  entries: MigrationRunRecord[];
}

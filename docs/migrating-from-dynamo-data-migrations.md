# Migrating From dynamo-data-migrations

`dynamark` is a breaking modernization. It does not keep the old CLI alias or AWS SDK v2 migration API.

## CLI Changes

```bash
# old
dynamo-data-migrations init
dynamo-data-migrations create add_customer
dynamo-data-migrations up --profile dev

# new
dynamark init
dynamark create add_customer
dynamark up --profile dev
```

## Package Changes

```json
{
  "name": "dynamark",
  "repository": {
    "type": "git",
    "url": "https://github.com/gizmodlabs/dynamark.git"
  }
}
```

The supported runtime is Node 24+.

## Migration API Changes

Old migrations received `AWS.DynamoDB` from the AWS SDK v2 monolith.

```ts
import AWS from "aws-sdk";

export async function up(ddb: AWS.DynamoDB) {
  await ddb
    .putItem({
      TableName: "CUSTOMER",
      Item: {
        CUSTOMER_ID: { S: "customer-1" }
      }
    })
    .promise();
}
```

New migrations receive `DynamoDBClient` from AWS SDK v3.

```ts
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";

export async function up(ddb: DynamoDBClient): Promise<void> {
  await ddb.send(
    new PutItemCommand({
      TableName: "CUSTOMER",
      Item: {
        CUSTOMER_ID: { S: "customer-1" }
      }
    })
  );
}
```

## Config Changes

`endpoint` is now supported per profile for local DynamoDB-compatible services like Dynalite.

```json
{
  "awsConfig": [
    {
      "profile": "local",
      "region": "local",
      "endpoint": "http://127.0.0.1:4567",
      "accessKeyId": "local",
      "secretAccessKey": "local"
    }
  ],
  "migrationsDir": "migrations",
  "migrationType": "ts"
}
```

If `accessKeyId` and `secretAccessKey` are omitted, `dynamark` loads credentials from the shared AWS credentials file for the selected profile.

## Migration Flow

```mermaid
flowchart LR
  OldCLI[dynamo-data-migrations] --> OldSDK[AWS SDK v2 AWS.DynamoDB]
  OldSDK --> OldPromise[putItem(params).promise]

  NewCLI[dynamark] --> NewSDK[AWS SDK v3 DynamoDBClient]
  NewSDK --> NewCommand[ddb.send(new PutItemCommand(params))]
```

## Checklist

- Replace CLI calls with `dynamark`.
- Install AWS SDK v3 command imports in migration files.
- Change `AWS.DynamoDB` types to `DynamoDBClient`.
- Replace `.promise()` calls with `ddb.send(new SomeCommand(params))`.
- Set `migrationType` to `ts`, `mjs`, or `cjs`.
- Run `dynamark status` against a safe environment before applying migrations.

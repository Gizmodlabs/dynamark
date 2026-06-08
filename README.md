# dynamark

`dynamark` is a DynamoDB data migration CLI for TypeScript and JavaScript projects.

It is a modernized successor to `dynamo-data-migrations`: Node 24 LTS, AWS SDK for JavaScript v3, ESM-first builds, runtime config validation, and clearer domain boundaries.

## Install

```bash
npm install -g dynamark
```

## Usage

```bash
dynamark
```

```text
Usage: dynamark [options] [command]

Options:
  -V, --version         output the version number
  -h, --help            display help for command

Commands:
  init                  initialize a new migration project
  create [description]  create a new database migration with the provided description
  up [options]          run all pending database migrations against a provided profile.
  down [options]        undo the last applied database migration against a provided profile.
  status [options]      print the changelog of the database against a provided profile
```

## Quick Start

```bash
dynamark init
```

Edit `config.json`:

```json
{
  "awsConfig": [
    {
      "profile": "",
      "region": "us-west-2",
      "endpoint": "",
      "accessKeyId": "",
      "secretAccessKey": ""
    }
  ],
  "migrationsDir": "migrations",
  "migrationType": "ts"
}
```

Create and run a migration:

```bash
dynamark create add-customers-table
dynamark up --profile default
dynamark status
dynamark down --shift 1
```

## Migration Contract

TypeScript migrations receive an AWS SDK v3 `DynamoDBClient`.

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

export async function down(ddb: DynamoDBClient): Promise<void> {
  // rollback here
}
```

Supported migration file types:

- `ts`: TypeScript, loaded through the TypeScript loader strategy.
- `mjs`: ESM JavaScript.
- `cjs`: CommonJS JavaScript.

## Runtime Flow

```mermaid
flowchart LR
  CLI[dynamark CLI] --> Config[config.json]
  Config --> LoaderFactory[MigrationLoaderFactory]
  Config --> ClientFactory[DynamoDbClientFactory]
  LoaderFactory --> Loader[ts | mjs | cjs loader strategy]
  ClientFactory --> DDB[DynamoDBClient]
  Loader --> Runner[Migration runner]
  DDB --> Runner
  Runner --> Migration[Migration up/down]
  Runner --> LogRepo[MigrationLogRepository]
  LogRepo --> Table[(MIGRATIONS_LOG_DB)]
```

The migration log table uses DynamoDB on-demand billing (`PAY_PER_REQUEST`) so small or occasional migration runs do not require provisioned capacity planning.

## Docs

- [Architecture](docs/architecture.md)
- [Migrating from dynamo-data-migrations](docs/migrating-from-dynamo-data-migrations.md)

## Development

```bash
npm install
npm run check-types
npm test
npm run build
npm run check
```

Notes:

- Node 24+ is the supported runtime.
- The local integration test starts Dynalite on `127.0.0.1`; restricted sandboxes may need network/listen approval.
- Source references: [AWS SDK v3 migration guide](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/migrating.html), [DynamoDB on-demand capacity mode](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/on-demand-capacity-mode.html), [Node release schedule](https://github.com/nodejs/Release).

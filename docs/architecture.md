# Dynamark Architecture

`dynamark` has one job: run ordered migration files against DynamoDB and record what ran in `MIGRATIONS_LOG_DB`.

## Runtime Model

```mermaid
flowchart TB
  User["User runs dynamark"] --> CLI["CLI command"]
  CLI --> Config["Load dynamark.config.json"]
  Config --> Profile["Select AWS profile"]
  Profile --> Client["Create DynamoDBClient"]
  Config --> Directory["Resolve migrations directory"]
  Directory --> Files["Sort migration files"]
  Config --> Loader["Choose loader: ts, mjs, or cjs"]
  Files --> Loader
  Loader --> Migration["Import migration module"]
  Client --> Runner["Run migration"]
  Migration --> Runner
  Runner --> LogRepo["MigrationLogRepository"]
  LogRepo --> LogTable[("MIGRATIONS_LOG_DB")]
```

## Config Boundary

`dynamark.config.json` is the project-level control point:

- `awsConfig` selects region, optional endpoint, and credentials.
- `migrationsDir` tells Dynamark where migration files live.
- `migrationType` chooses the loader strategy: `ts`, `mjs`, or `cjs`.

Local DynamoDB works by setting `endpoint` to `http://localhost:8000` and using throwaway credentials. Real AWS usage leaves `endpoint` blank and can load credentials from the shared AWS profile.

## Up Flow

```mermaid
sequenceDiagram
  participant User
  participant CLI as dynamark up
  participant Config as dynamark.config.json
  participant DDB as DynamoDBClient
  participant Repo as MigrationLogRepository
  participant Loader as MigrationLoader
  participant Migration

  User->>CLI: dynamark up
  CLI->>Config: load config
  Config->>DDB: create client
  CLI->>Repo: check MIGRATIONS_LOG_DB
  alt migration log table missing
    Repo->>DDB: CreateTable PAY_PER_REQUEST
    Repo->>DDB: wait until ACTIVE
  end
  CLI->>Repo: read applied migrations
  CLI->>Loader: import pending file
  Loader->>Migration: expose up/down functions
  CLI->>Migration: up(ddb)
  CLI->>Repo: write migration log row
```

## Down Flow

```mermaid
sequenceDiagram
  participant User
  participant CLI as dynamark down
  participant Repo as MigrationLogRepository
  participant Loader as MigrationLoader
  participant Migration

  User->>CLI: dynamark down --shift 1
  CLI->>Repo: read applied migrations
  CLI->>CLI: select latest files in reverse order
  loop selected migrations
    CLI->>Loader: import migration file
    Loader->>Migration: expose down function
    CLI->>Migration: down(ddb)
    CLI->>Repo: delete migration log row
  end
```

## Local Test Loop

```mermaid
flowchart LR
  Docker["amazon/dynamodb-local"] --> Endpoint["localhost:8000"]
  Endpoint --> AwsCli["aws dynamodb list-tables"]
  Endpoint --> Config["dynamark.config.json endpoint"]
  Config --> Dynamark["dynamark up/status/down"]
  Dynamark --> TestTable[("TestTable")]
  Dynamark --> LogTable[("MIGRATIONS_LOG_DB")]
```

## Code Boundaries

- CLI commands live in `src/bin/dynamark.ts` and call action functions.
- Action functions own the user-visible workflows: `init`, `create`, `up`, `down`, and `status`.
- Environment modules own config loading, DynamoDB client creation, migration directory lookup, and migration log storage.
- File loaders keep runtime migration imports separate from the bundled CLI so user migration files still load from the project `migrations/` directory.

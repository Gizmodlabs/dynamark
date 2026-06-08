# Dynamark Architecture

`dynamark` keeps the domain small: a CLI reads migration config, loads ordered migration files, runs each migration against DynamoDB, and records applied files in `MIGRATIONS_LOG_DB`.

## Component View

```mermaid
flowchart TB
  subgraph CLI["Command pattern"]
    Init[init]
    Create[create]
    Up[up]
    Down[down]
    Status[status]
  end

  subgraph Config["Validated config boundary"]
    ConfigJson[config.json]
    ConfigLoader[Config loader]
    ClientFactory[DynamoDbClientFactory]
    LoaderFactory[MigrationLoaderFactory]
  end

  subgraph Loading["Strategy pattern"]
    TsLoader[TypeScript loader]
    MjsLoader[ESM loader]
    CjsLoader[CJS loader]
  end

  subgraph Runtime["Template Method style runner"]
    OrderedFiles[Ordered migration files]
    Migration[Migration up/down]
    Runner[Runner]
  end

  subgraph Storage["Repository/Adapter pattern"]
    LogRepo[MigrationLogRepository]
    LogTable[(MIGRATIONS_LOG_DB)]
  end

  Init --> ConfigJson
  Create --> ConfigLoader
  Up --> ConfigLoader
  Down --> ConfigLoader
  Status --> ConfigLoader
  ConfigLoader --> ClientFactory
  ConfigLoader --> LoaderFactory
  LoaderFactory --> TsLoader
  LoaderFactory --> MjsLoader
  LoaderFactory --> CjsLoader
  TsLoader --> OrderedFiles
  MjsLoader --> OrderedFiles
  CjsLoader --> OrderedFiles
  ClientFactory --> Runner
  OrderedFiles --> Runner
  Runner --> Migration
  Runner --> LogRepo
  LogRepo --> LogTable
```

## Up Flow

```mermaid
sequenceDiagram
  participant User
  participant CLI as dynamark up
  participant Config as Config loader
  participant DDB as DynamoDBClient
  participant Repo as MigrationLogRepository
  participant Loader as MigrationLoaderStrategy
  participant Migration

  User->>CLI: dynamark up --profile dev
  CLI->>Config: load config.json
  Config->>DDB: build client for profile
  CLI->>Repo: does MIGRATIONS_LOG_DB exist?
  alt table missing
    Repo->>DDB: CreateTable PAY_PER_REQUEST
    Repo->>DDB: wait until active
  end
  CLI->>Repo: list applied migrations
  CLI->>Loader: load pending migration file
  Loader->>Migration: import up/down module
  CLI->>Migration: up(ddb)
  CLI->>Repo: add migration log row
```

## Down Flow

```mermaid
sequenceDiagram
  participant User
  participant CLI as dynamark down
  participant Repo as MigrationLogRepository
  participant Loader as MigrationLoaderStrategy
  participant Migration

  User->>CLI: dynamark down --shift 2
  CLI->>Repo: list applied migrations
  CLI->>CLI: select latest applied files in reverse order
  loop each selected migration
    CLI->>Loader: load migration file
    Loader->>Migration: import up/down module
    CLI->>Migration: down(ddb)
    CLI->>Repo: delete migration log row
  end
```

## Patterns

- `Command`: each CLI command maps to one small action module.
- `Strategy`: `ts`, `mjs`, and `cjs` migration loaders share the same interface.
- `Factory`: config chooses the AWS client and migration loader.
- `Repository/Adapter`: DynamoDB log table access lives in `MigrationLogRepository`.
- `Template Method style`: `up` and `down` share the same high-level pipeline: resolve files -> load migration -> execute -> update log.

The point is debuggability. If migration loading fails, inspect the Strategy layer. If log writes fail, inspect the Repository layer. If AWS profile selection fails, inspect the Factory/config boundary.

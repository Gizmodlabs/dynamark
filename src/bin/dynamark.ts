#!/usr/bin/env node
import Table from "cli-table3";
import { InvalidArgumentError, Option, program } from "commander";

import {
  createAction,
  downAction,
  historyAction,
  initAction,
  statusAction,
  upAction,
} from "../lib/dynamark.js";
import type { MigrationRunRecord } from "../lib/types.js";

const VERSION = "1.0.0";

class MigrationError extends Error {
  migrated?: string[];
}

function printMigrated(migrated: string[] = [], direction: string) {
  const migratedItemsInfo = migrated.map((item) => `${direction}: ${item}`).join("\n");
  if (migratedItemsInfo) {
    console.info(migratedItemsInfo);
  }
}

function printStatusTable(statusItems: { fileName: string; appliedAt: string }[]) {
  const table = new Table({ head: ["Filename", "Applied At"] });
  table.push(...statusItems.map((item) => Object.values(item)));
  console.info(table.toString());
}

function printHistoryTable(runs: MigrationRunRecord[]) {
  const table = new Table({
    head: ["Run", "Action", "Result", "Files", "Profile", "Finished At"],
  });
  table.push(
    ...runs.map((run) => [
      run.runId,
      run.action,
      run.result,
      run.files.length ? run.files.join("\n") : "-",
      run.profile,
      run.finishedAt,
    ]),
  );
  console.info(table.toString());
}

function parseShift(value: string) {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("Must be a whole number. Use 0 to roll back everything.");
  }
  return Number.parseInt(value, 10);
}

const profileOption = new Option(
  "--profile <string>",
  "AWS credentials and configuration to be used",
)
  .env("AWS_PROFILE")
  .default("default");

program.name("dynamark").description("Run DynamoDB data migrations").version(VERSION);

program
  .command("init")
  .description("initialize a new migration project")
  .action(async () => {
    try {
      await initAction();
      console.info(
        "Initialization successful. Please edit the generated dynamark.config.json file",
      );
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });

program
  .command("create [description]")
  .description("create a new database migration with the provided description")
  .action(async (description) => {
    try {
      const fileName = await createAction(description);
      console.info("Created: migrations/".concat(fileName));
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });

program
  .command("up")
  .addOption(profileOption)
  .description("run all pending database migrations against a provided profile.")
  .action(async (option) => {
    try {
      const migrated = await upAction(option.profile);
      printMigrated(migrated, "MIGRATED UP");
    } catch (error) {
      console.error(error);
      const e = error as MigrationError;
      printMigrated(e.migrated, "MIGRATED UP");
      process.exitCode = 1;
    }
  });

program
  .command("down")
  .addOption(profileOption)
  .option(
    "--shift <n>",
    "Number of down shift to perform. 0 will rollback all changes",
    parseShift,
    1,
  )
  .description("undo the last applied database migration against a provided profile.")
  .action(async (option) => {
    try {
      const migrated = await downAction(option.profile, option.shift);
      printMigrated(migrated, "MIGRATED DOWN");
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });

program
  .command("status")
  .addOption(profileOption)
  .description("print the changelog of the database against a provided profile")
  .action(async (option) => {
    try {
      const statusItems = await statusAction(option.profile);
      printStatusTable(statusItems);
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });

program
  .command("history")
  .description("print the local file-based record of past migration runs")
  .action(async () => {
    try {
      const runs = await historyAction();
      printHistoryTable(runs);
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });

if (process.argv.length <= 2) {
  program.outputHelp();
} else {
  await program.parseAsync(process.argv);
}

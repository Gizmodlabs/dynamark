#!/usr/bin/env node
import Table from "cli-table3";
import { Option, program } from "commander";

import { createAction, downAction, initAction, statusAction, upAction } from "../lib/dynamark.js";

const VERSION = "2.0.0";

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
      console.info("Initialization successful. Please edit the generated config.json file");
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
    (value) => Number.parseInt(value, 10),
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

if (process.argv.length <= 2) {
  program.outputHelp();
} else {
  await program.parseAsync(process.argv);
}

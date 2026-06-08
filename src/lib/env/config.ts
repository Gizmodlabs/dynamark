import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

import type { DynamarkConfig } from "../types.js";
import { CjsFileLoader } from "./fileLoader/cjsFileLoader.js";
import { MjsFileLoader } from "./fileLoader/mjsFileLoader.js";
import { TsFileLoader } from "./fileLoader/tsFileLoader.js";
import * as paths from "./paths.js";

const tsMigrationType = "ts";
const cjsMigrationType = "cjs";
const mjsMigrationType = "mjs";

const defaultConfig: DynamarkConfig = {
  awsConfig: [
    {
      profile: "",
      region: "us-west-2",
      endpoint: "",
      accessKeyId: "",
      secretAccessKey: "",
    },
  ],
  migrationsDir: "migrations",
  migrationType: tsMigrationType,
};

const AwsProfileConfigSchema = z.object({
  profile: z.string().optional().default(""),
  region: z.string().optional().default(""),
  endpoint: z.string().optional().default(""),
  accessKeyId: z.string().optional().default(""),
  secretAccessKey: z.string().optional().default(""),
});

const DynamarkConfigSchema = z.object({
  awsConfig: z.array(AwsProfileConfigSchema).default([]),
  migrationsDir: z.string().min(1, "migrationsDir is required"),
  migrationType: z.string().default(""),
});

export function isConfigFilePresent() {
  return existsSync(paths.targetConfigPath());
}

export function initializeConfig() {
  writeFileSync(paths.targetConfigPath(), JSON.stringify(defaultConfig, null, 2));
}

export function getFileLoader() {
  const configDetails = loadConfig();
  switch (configDetails.migrationType) {
    case tsMigrationType:
      return new TsFileLoader();
    case cjsMigrationType:
      return new CjsFileLoader();
    case mjsMigrationType:
      return new MjsFileLoader();
    default:
      throw new Error(
        `Unsupported migration type in ${paths.configFileName}. Ensure migration type is ts,cjs or mjs`,
      );
  }
}

export function loadAWSConfig() {
  return loadConfig().awsConfig;
}

export function loadMigrationsDir() {
  return loadConfig().migrationsDir;
}

export function loadConfig(): DynamarkConfig {
  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(paths.targetConfigPath(), "utf8"));
  } catch {
    throw new Error(
      `Unable to load config, ensure ${paths.configFileName} file exists, if not initialize it with init command`,
    );
  }

  const result = DynamarkConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid ${paths.configFileName}: ${z.prettifyError(result.error)}`);
  }

  return result.data;
}

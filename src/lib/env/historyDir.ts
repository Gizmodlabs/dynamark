import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { HistoryJournal, MigrationRunAction, MigrationRunRecord } from "../types.js";
import { loadConfig } from "./config.js";

export const JOURNAL_FILE_NAME = "_journal.json";
export const JOURNAL_VERSION = 1;
export const DEFAULT_HISTORY_DIR_NAME = "history";

export interface MigrationRunInput {
  action: MigrationRunAction;
  profile: string;
  startedAt: Date;
  finishedAt: Date;
  files: string[];
  error?: Error;
}

export function resolveHistoryDirPath() {
  const configDetails = loadConfig();
  const historyDir =
    configDetails.historyDir ?? path.join(configDetails.migrationsDir, DEFAULT_HISTORY_DIR_NAME);

  if (path.isAbsolute(historyDir)) {
    return historyDir;
  }

  return path.join(process.cwd(), historyDir);
}

export function readJournal(): HistoryJournal {
  const journalPath = path.join(resolveHistoryDirPath(), JOURNAL_FILE_NAME);
  if (!existsSync(journalPath)) {
    return { version: JOURNAL_VERSION, entries: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(journalPath, "utf8"));
  } catch {
    throw new Error(`Could not parse history journal at ${journalPath}`);
  }

  const journal = parsed as HistoryJournal;
  if (!Array.isArray(journal.entries)) {
    throw new Error(`Invalid history journal at ${journalPath}: missing entries array`);
  }

  return journal;
}

export function listRuns(): MigrationRunRecord[] {
  return readJournal().entries;
}

export function recordRun(input: MigrationRunInput): MigrationRunRecord {
  const historyDirPath = resolveHistoryDirPath();
  mkdirSync(historyDirPath, { recursive: true });

  const journal = readJournal();
  const idx = journal.entries.length + 1;
  const record: MigrationRunRecord = {
    idx,
    runId: buildRunId(idx, input.finishedAt, input.action),
    action: input.action,
    profile: input.profile,
    startedAt: input.startedAt.toJSON(),
    finishedAt: input.finishedAt.toJSON(),
    durationMs: input.finishedAt.getTime() - input.startedAt.getTime(),
    result: input.error ? "failed" : "success",
    files: input.files,
    ...(input.error ? { error: input.error.message } : {}),
  };

  writeFileSync(path.join(historyDirPath, `${record.runId}.json`), JSON.stringify(record, null, 2));

  journal.entries.push(record);
  writeFileSync(path.join(historyDirPath, JOURNAL_FILE_NAME), JSON.stringify(journal, null, 2));

  return record;
}

export function recordRunSafely(input: MigrationRunInput): MigrationRunRecord | undefined {
  try {
    return recordRun(input);
  } catch (error_) {
    const cause = error_ as Error;
    console.warn(`Could not record migration history: ${cause.message}`);
    return undefined;
  }
}

function buildRunId(idx: number, finishedAt: Date, action: MigrationRunAction) {
  const timestamp = finishedAt.toJSON().replaceAll(/[-:.]/g, "");
  return `${String(idx).padStart(4, "0")}_${timestamp}_${action}`;
}

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  JOURNAL_FILE_NAME,
  listRuns,
  readJournal,
  recordRun,
  recordRunSafely,
  resolveHistoryDirPath,
} from "../../../src/lib/env/historyDir.js";
import { withTempCwd } from "../../helpers/tempCwd.js";

describe("historyDir", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults the history directory to a history folder inside the migrations directory", async () => {
    await withTempCwd(() => {
      writeConfig();

      expect(resolveHistoryDirPath()).toBe(path.join(process.cwd(), "migrations", "history"));
    });
  });

  it("honors a custom historyDir from the config", async () => {
    await withTempCwd(() => {
      writeConfig({ historyDir: "audit/runs" });

      expect(resolveHistoryDirPath()).toBe(path.join(process.cwd(), "audit", "runs"));
    });
  });

  it("returns an empty journal when no history has been recorded", async () => {
    await withTempCwd(() => {
      writeConfig();

      expect(readJournal()).toEqual({ version: 1, entries: [] });
      expect(listRuns()).toEqual([]);
    });
  });

  it("records a run as a journal entry plus an immutable per-run file", async () => {
    await withTempCwd(() => {
      writeConfig();

      const record = recordRun({
        action: "up",
        profile: "default",
        startedAt: new Date("2026-06-12T10:00:00.000Z"),
        finishedAt: new Date("2026-06-12T10:00:01.250Z"),
        files: ["1-first.ts", "2-second.ts"],
      });

      expect(record).toMatchObject({
        idx: 1,
        runId: "0001_20260612T100001250Z_up",
        action: "up",
        profile: "default",
        durationMs: 1250,
        result: "success",
        files: ["1-first.ts", "2-second.ts"],
      });

      const historyDirPath = resolveHistoryDirPath();
      const journal = JSON.parse(
        readFileSync(path.join(historyDirPath, JOURNAL_FILE_NAME), "utf8"),
      );
      expect(journal.entries).toEqual([record]);

      const runFile = JSON.parse(
        readFileSync(path.join(historyDirPath, `${record.runId}.json`), "utf8"),
      );
      expect(runFile).toEqual(record);
    });
  });

  it("increments the run index across successive runs and captures failures", async () => {
    await withTempCwd(() => {
      writeConfig();

      recordRun({
        action: "up",
        profile: "default",
        startedAt: new Date("2026-06-12T10:00:00.000Z"),
        finishedAt: new Date("2026-06-12T10:00:01.000Z"),
        files: ["1-first.ts"],
      });
      const failed = recordRun({
        action: "down",
        profile: "staging",
        startedAt: new Date("2026-06-12T11:00:00.000Z"),
        finishedAt: new Date("2026-06-12T11:00:02.000Z"),
        files: [],
        error: new Error("boom"),
      });

      expect(failed).toMatchObject({
        idx: 2,
        action: "down",
        profile: "staging",
        result: "failed",
        error: "boom",
      });

      const runs = listRuns();
      expect(runs).toHaveLength(2);
      expect(runs.map((run) => run.idx)).toEqual([1, 2]);
      expect(readdirSync(resolveHistoryDirPath()).sort()).toEqual([
        `${runs[0].runId}.json`,
        `${runs[1].runId}.json`,
        JOURNAL_FILE_NAME,
      ]);
    });
  });

  it("throws on a corrupted journal but never lets recordRunSafely throw", async () => {
    await withTempCwd(() => {
      writeConfig();
      mkdirSync("migrations/history", { recursive: true });
      writeFileSync(path.join("migrations/history", JOURNAL_FILE_NAME), "{ not json");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(() => readJournal()).toThrow(/Could not parse history journal/);

      const record = recordRunSafely({
        action: "up",
        profile: "default",
        startedAt: new Date("2026-06-12T10:00:00.000Z"),
        finishedAt: new Date("2026-06-12T10:00:01.000Z"),
        files: ["1-first.ts"],
      });

      expect(record).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Could not record migration history"),
      );
    });
  });

  it("rejects a journal without an entries array", async () => {
    await withTempCwd(() => {
      writeConfig();
      mkdirSync("migrations/history", { recursive: true });
      writeFileSync(
        path.join("migrations/history", JOURNAL_FILE_NAME),
        JSON.stringify({ version: 1 }),
      );

      expect(() => readJournal()).toThrow(/missing entries array/);
      expect(existsSync(path.join("migrations/history", JOURNAL_FILE_NAME))).toBe(true);
    });
  });
});

function writeConfig(overrides: Record<string, unknown> = {}) {
  writeFileSync(
    "dynamark.config.json",
    JSON.stringify({
      awsConfig: [{ profile: "", region: "us-west-2" }],
      migrationsDir: "migrations",
      migrationType: "ts",
      ...overrides,
    }),
  );
}

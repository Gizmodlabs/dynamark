import { writeFileSync } from "node:fs";

import { history } from "../../../src/lib/actions/history.js";
import * as historyDir from "../../../src/lib/env/historyDir.js";
import { withTempCwd } from "../../helpers/tempCwd.js";

describe("history", () => {
  it("returns an empty list when no runs have been recorded", async () => {
    await withTempCwd(async () => {
      writeConfig();

      await expect(history()).resolves.toEqual([]);
    });
  });

  it("returns recorded runs in the order they happened", async () => {
    await withTempCwd(async () => {
      writeConfig();
      historyDir.recordRun({
        action: "up",
        profile: "default",
        startedAt: new Date("2026-06-12T10:00:00.000Z"),
        finishedAt: new Date("2026-06-12T10:00:01.000Z"),
        files: ["1-first.ts"],
      });
      historyDir.recordRun({
        action: "down",
        profile: "default",
        startedAt: new Date("2026-06-12T11:00:00.000Z"),
        finishedAt: new Date("2026-06-12T11:00:01.000Z"),
        files: ["1-first.ts"],
      });

      const runs = await history();

      expect(runs).toHaveLength(2);
      expect(runs.map((run) => run.action)).toEqual(["up", "down"]);
    });
  });
});

function writeConfig() {
  writeFileSync(
    "dynamark.config.json",
    JSON.stringify({
      awsConfig: [{ profile: "", region: "us-west-2" }],
      migrationsDir: "migrations",
      migrationType: "ts",
    }),
  );
}

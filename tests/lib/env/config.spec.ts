import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getFileLoader, initializeConfig, loadConfig } from "../../../src/lib/env/config.js";
import { TsFileLoader } from "../../../src/lib/env/fileLoader/tsFileLoader.js";
import { withTempCwd } from "../../helpers/tempCwd.js";

describe("config", () => {
  it("initializes a dynamark config in the current working directory", async () => {
    await withTempCwd(() => {
      initializeConfig();

      const configPath = path.join(process.cwd(), "config.json");
      expect(existsSync(configPath)).toBe(true);
      expect(JSON.parse(readFileSync(configPath, "utf8"))).toMatchObject({
        migrationsDir: "migrations",
        migrationType: "",
      });
    });
  });

  it("loads the TypeScript migration loader from config.json", async () => {
    await withTempCwd(() => {
      writeFileSync(
        "config.json",
        JSON.stringify({
          awsConfig: [{ profile: "", region: "us-west-2" }],
          migrationsDir: "migrations",
          migrationType: "ts",
        }),
      );

      expect(loadConfig().migrationType).toBe("ts");
      expect(getFileLoader()).toBeInstanceOf(TsFileLoader);
    });
  });

  it("rejects unsupported migration types with a useful message", async () => {
    await withTempCwd(() => {
      writeFileSync(
        "config.json",
        JSON.stringify({
          awsConfig: [{ profile: "", region: "us-west-2" }],
          migrationsDir: "migrations",
          migrationType: "rb",
        }),
      );

      expect(() => getFileLoader()).toThrow("Unsupported migration type");
    });
  });
});

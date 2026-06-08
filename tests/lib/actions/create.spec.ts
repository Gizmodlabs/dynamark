import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { create } from "../../../src/lib/actions/create.js";
import { withTempCwd } from "../../helpers/tempCwd.js";

describe("create", () => {
  it("creates a TypeScript migration from the configured strategy template", async () => {
    await withTempCwd(async () => {
      mkdirSync("migrations");
      writeFileSync(
        "dynamark.config.json",
        JSON.stringify({
          awsConfig: [{ profile: "", region: "us-west-2" }],
          migrationsDir: "migrations",
          migrationType: "ts",
        }),
      );

      const fileName = await create("add customers table");

      expect(fileName).toMatch(/^\d+-add_customers_table\.ts$/);
      expect(existsSync(path.join("migrations", fileName))).toBe(true);
    });
  });

  it("fails when the configured migrations directory is missing", async () => {
    await withTempCwd(async () => {
      writeFileSync(
        "dynamark.config.json",
        JSON.stringify({
          awsConfig: [{ profile: "", region: "us-west-2" }],
          migrationsDir: "migrations",
          migrationType: "ts",
        }),
      );

      await expect(create("missing dir")).rejects.toThrow("migrations directory");
    });
  });
});

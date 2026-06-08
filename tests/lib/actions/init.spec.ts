import { existsSync } from "node:fs";

import { init } from "../../../src/lib/actions/init.js";
import { withTempCwd } from "../../helpers/tempCwd.js";

describe("init", () => {
  it("creates config.json and the default migrations directory", async () => {
    await withTempCwd(async () => {
      await init();

      expect(existsSync("config.json")).toBe(true);
      expect(existsSync("migrations")).toBe(true);
    });
  });

  it("does not overwrite an existing config.json", async () => {
    await withTempCwd(async () => {
      await init();

      await expect(init()).rejects.toThrow("Config file already exist");
    });
  });
});

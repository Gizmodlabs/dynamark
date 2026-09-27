import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

describe("dynamark bin", () => {
  it("reports the v1 CLI version", async () => {
    const tsxCli = path.join(process.cwd(), "node_modules/tsx/dist/cli.mjs");
    const dynamarkBin = path.join(process.cwd(), "src/bin/dynamark.ts");

    const { stdout } = await execFileAsync(process.execPath, [tsxCli, dynamarkBin, "--version"]);

    expect(stdout.trim()).toBe("1.0.0");
  });

  it("exposes the history command", async () => {
    const tsxCli = path.join(process.cwd(), "node_modules/tsx/dist/cli.mjs");
    const dynamarkBin = path.join(process.cwd(), "src/bin/dynamark.ts");

    const { stdout } = await execFileAsync(process.execPath, [tsxCli, dynamarkBin, "--help"]);

    expect(stdout).toContain("history");
    expect(stdout).toContain("record of past migration runs");
  });

  it.each(["abc", "1abc", "1.5"])("rejects down --shift %s", async (shift) => {
    const tsxCli = path.join(process.cwd(), "node_modules/tsx/dist/cli.mjs");
    const dynamarkBin = path.join(process.cwd(), "src/bin/dynamark.ts");

    await expect(
      execFileAsync(process.execPath, [tsxCli, dynamarkBin, "down", "--shift", shift]),
    ).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("Must be a whole number") });
  });
});

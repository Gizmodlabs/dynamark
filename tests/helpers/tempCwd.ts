import { existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export async function withTempCwd<T>(callback: (dir: string) => Promise<T> | T): Promise<T> {
  const originalCwd = process.cwd();
  const dir = mkdtempSync(path.join(tmpdir(), "dynamark-"));
  const sourceNodeModules = path.join(originalCwd, "node_modules");

  if (existsSync(sourceNodeModules)) {
    symlinkSync(sourceNodeModules, path.join(dir, "node_modules"), "dir");
  }

  process.chdir(dir);
  try {
    return await callback(dir);
  } finally {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  }
}

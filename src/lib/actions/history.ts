import * as historyDir from "../env/historyDir.js";
import type { MigrationRunRecord } from "../types.js";

export async function history(): Promise<MigrationRunRecord[]> {
  return historyDir.listRuns();
}

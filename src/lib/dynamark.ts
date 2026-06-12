import { create } from "./actions/create.js";
import { down } from "./actions/down.js";
import { history } from "./actions/history.js";
import { init } from "./actions/init.js";
import { status } from "./actions/status.js";
import { up } from "./actions/up.js";

export const initAction = async () => {
  return init();
};

export const createAction = async (description: string) => {
  return create(description);
};

export const upAction = async (profile: string) => {
  return up(profile);
};

export const downAction = async (profile: string, downShift: number) => {
  return down(profile, downShift);
};

export const statusAction = async (profile: string) => {
  return status(profile);
};

export const historyAction = async () => {
  return history();
};

export type {
  HistoryJournal,
  Migration,
  MigrationLogItem,
  MigrationRunAction,
  MigrationRunRecord,
  MigrationRunResult,
  MigrationStatusItem,
} from "./types.js";
export { create, down, history, init, status, up };

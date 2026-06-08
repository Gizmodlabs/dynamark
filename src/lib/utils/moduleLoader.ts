import "tsx/esm";

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import type { Migration } from "../types.js";

const require = createRequire(import.meta.url);

export async function importModule(importPath: string): Promise<Migration> {
  return import(pathToFileURL(importPath).href) as Promise<Migration>;
}

export async function importCjs(importPath: string): Promise<Migration> {
  return require(importPath) as Migration;
}

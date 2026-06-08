import type { Migration } from "../../types.js";
import { importCjs } from "../../utils/moduleLoader.js";
import * as paths from "../paths.js";
import { FileLoader } from "./fileLoader.js";

export class CjsFileLoader extends FileLoader {
  constructor() {
    super(paths.cjsExtension, paths.cjsMigrationPath);
  }

  async loadMigrationFile(importPath: string): Promise<Migration> {
    return importCjs(importPath);
  }
}

import type { Migration } from "../../types.js";
import { importModule } from "../../utils/moduleLoader.js";
import * as paths from "../paths.js";
import { FileLoader } from "./fileLoader.js";

export class TsFileLoader extends FileLoader {
  constructor() {
    super(paths.tsExtension, paths.tsMigrationPath);
  }

  async loadMigrationFile(importPath: string): Promise<Migration> {
    return importModule(importPath);
  }
}

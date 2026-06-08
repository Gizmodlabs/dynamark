import type { Migration } from "../../types.js";
import { importModule } from "../../utils/moduleLoader.js";
import * as paths from "../paths.js";
import { FileLoader } from "./fileLoader.js";

export class MjsFileLoader extends FileLoader {
  constructor() {
    super(paths.mjsExtension, paths.mjsMigrationPath);
  }

  async loadMigrationFile(importPath: string): Promise<Migration> {
    return importModule(importPath);
  }
}

import type { Migration } from "../../types.js";

export abstract class FileLoader {
  readonly configExtension: string;

  readonly migrationTemplate: string;

  constructor(extension: string, migrationPath: string) {
    this.configExtension = extension;
    this.migrationTemplate = migrationPath;
  }

  abstract loadMigrationFile(importPath: string): Promise<Migration>;
}

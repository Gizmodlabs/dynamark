import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const externalNodeModules = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
  "tsx/esm",
]);

export default defineConfig(({ mode }) => ({
  test: {
    include: ["tests/**/*.spec.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
    },
    server: {
      deps: {
        external: ["tsx", "tsx/esm"],
      },
    },
  },
  build: {
    outDir: "build",
    emptyOutDir: true,
    target: "es2024",
    minify: false,
    sourcemap: true,
    ssr: true,
    rolldownOptions: {
      input: {
        "src/lib/dynamark": resolve(import.meta.dirname, "src/lib/dynamark.ts"),
        "src/bin/dynamark": resolve(import.meta.dirname, "src/bin/dynamark.ts"),
      },
      external: (source) => externalNodeModules.has(source),
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "src/chunks/[name]-[hash].js",
        format: "es",
      },
    },
  },
  ssr:
    mode === "test"
      ? undefined
      : {
          noExternal: true,
          external: ["tsx/esm"],
        },
}));

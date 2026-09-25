#!/usr/bin/env node
// Starts an in-memory DynamoDB mock (Dynalite) so the dynamark CLI can be
// tested locally without Docker or AWS. Data is lost when the process exits.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dynalite = require("dynalite");

const port = Number(process.env.PORT ?? 8000);
const server = dynalite({ createTableMs: 0, deleteTableMs: 0, updateTableMs: 0 });

server.listen(port, "127.0.0.1", (error) => {
  if (error) {
    console.error(`Failed to start DynamoDB mock on port ${port}:`, error.message);
    process.exit(1);
  }

  const endpoint = `http://127.0.0.1:${port}`;
  console.log(`DynamoDB mock (Dynalite) running at ${endpoint}`);
  console.log("Point dynamark.config.json at it:\n");
  console.log(
    JSON.stringify(
      {
        awsConfig: [
          {
            profile: "",
            region: "us-west-2",
            endpoint,
            accessKeyId: "local",
            secretAccessKey: "local",
          },
        ],
        migrationsDir: "migrations",
        migrationType: "ts",
        historyDir: "migrations/history",
      },
      null,
      2,
    ),
  );
  console.log("\nPress Ctrl+C to stop. All data is in-memory and discarded on exit.");
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});

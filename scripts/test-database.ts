import { config } from "dotenv";

import { databaseName, prepareTestDatabase, resetTestDatabase, resolveTestDatabaseUrl } from "../src/test-support/test-database";

/**
 * npm run db:test:setup  create the test database if needed and apply every migration to it
 * npm run db:test:reset  drop it and start again from nothing
 * Both act only on a database whose name ends in _test, and never on the builder database.
 */
async function main() {
  config({ path: ".env" });
  const url = resolveTestDatabaseUrl(process.env);
  const command = process.argv[2] ?? "setup";
  if (command === "reset") {
    await resetTestDatabase(url);
    console.info(`Dropped and recreated ${databaseName(url)}.`);
  } else if (command !== "setup") {
    throw new Error("Use setup or reset.");
  }
  const result = await prepareTestDatabase(url);
  console.info(`${databaseName(url)} is ready${result.created ? " (created)" : ""}${result.migrated ? " (migrations applied)" : " (already up to date)"}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

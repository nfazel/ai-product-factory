import { config } from "dotenv";

import { prepareTestDatabase, resolveTestDatabaseUrl } from "./src/test-support/test-database";

/** Once per run: make sure the separate test database exists and has every migration. Never touches the builder database. */
export default async function setup() {
  config({ path: ".env" });
  const url = resolveTestDatabaseUrl(process.env);
  const result = await prepareTestDatabase(url);
  if (result.created || result.migrated) console.info(`[tests] test database ready${result.created ? " (created)" : ""}${result.migrated ? " (migrated)" : ""}`);
}

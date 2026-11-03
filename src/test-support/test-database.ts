import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import pg from "pg";

/**
 * The tests run against their own database, never the builder's. The name must say so, so a mistyped setting cannot point the
 * suite (which creates and deletes records freely) at real data. Pure helpers first; the database work is below.
 */
const ALLOWED_SUFFIX = /(?:_test|_clone)$/;

export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

export function assertTestDatabaseName(name: string): void {
  if (!name || !ALLOWED_SUFFIX.test(name)) {
    throw new Error(
      `Refusing to run tests against "${name || "(no database)"}". A test database must be named ending in _test, and never the builder database. ` +
        "Set TEST_DATABASE_URL, or leave it unset to use <your database>_test.",
    );
  }
}

/** TEST_DATABASE_URL when set, otherwise the builder URL with `_test` added to the database name. Always checked. */
export function resolveTestDatabaseUrl(env: Record<string, string | undefined>): string {
  const explicit = env.TEST_DATABASE_URL?.trim();
  const builder = env.DATABASE_URL?.trim();
  let url = explicit;
  if (!url) {
    if (!builder) throw new Error("Set DATABASE_URL (or TEST_DATABASE_URL) so the test database can be located.");
    const derived = new URL(builder);
    const name = databaseName(builder);
    derived.pathname = `/${ALLOWED_SUFFIX.test(name) ? name : `${name}_test`}`;
    url = derived.toString();
  }
  assertTestDatabaseName(databaseName(url));
  return url;
}

const maintenance = (url: string) => {
  const value = new URL(url);
  value.pathname = "/postgres";
  value.search = "";
  return value.toString();
};

/** Creates the test database when it does not exist. Only ever acts on a name that passed the check above. */
export async function ensureTestDatabase(url: string): Promise<boolean> {
  const name = databaseName(url);
  assertTestDatabaseName(name);
  const admin = new pg.Client({ connectionString: maintenance(url) });
  await admin.connect();
  try {
    const found = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (found.rowCount) return false;
    await admin.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
    return true;
  } finally {
    await admin.end();
  }
}

/** Drops (when asked) and recreates the test database, so the next run starts from nothing. */
export async function resetTestDatabase(url: string): Promise<void> {
  const name = databaseName(url);
  assertTestDatabaseName(name);
  const admin = new pg.Client({ connectionString: maintenance(url) });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name.replace(/"/g, '""')}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
  await ensureTestDatabase(url);
}

/** True when every migration in the repository is applied to the database. */
export async function testDatabaseIsCurrent(url: string, root = process.cwd()): Promise<boolean> {
  const wanted = fs.readdirSync(path.join(root, "prisma", "migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query("SELECT count(*)::int AS applied FROM _prisma_migrations WHERE finished_at IS NOT NULL").catch(() => null);
    return result?.rows[0]?.applied === wanted;
  } finally {
    await client.end();
  }
}

/** Applies the repository's migrations to the test database only. */
export function migrateTestDatabase(url: string, root = process.cwd()): void {
  assertTestDatabaseName(databaseName(url));
  const run = spawnSync(process.execPath, [path.join(root, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], {
    cwd: root,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test", DATABASE_URL: url },
    encoding: "utf8",
  });
  if (run.status !== 0) throw new Error(`Migrating the test database failed.\n${run.stdout}\n${run.stderr}`);
}

export async function prepareTestDatabase(url: string, root = process.cwd()): Promise<{ created: boolean; migrated: boolean }> {
  const created = await ensureTestDatabase(url);
  const current = !created && (await testDatabaseIsCurrent(url, root));
  if (!current) migrateTestDatabase(url, root);
  return { created, migrated: !current };
}

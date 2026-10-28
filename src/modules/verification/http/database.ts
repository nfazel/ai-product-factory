import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * A disposable PostgreSQL database for one verification attempt.
 *
 * Safety rules, enforced here rather than by convention:
 * - The admin connection is taken from VERIFICATION_DATABASE_ADMIN_URL only. It is never derived from DATABASE_URL,
 *   so the AI Product Builder's credentials are not used for provisioning unless someone configures them explicitly.
 * - The admin role is checked before anything is created (see `assessAdminRole`). It must be a dedicated role with
 *   CREATEDB and nothing that would let it reach other data: no superuser, no CREATEROLE, no BYPASSRLS, not the
 *   builder's role, and it must not own any database other than verification databases.
 * - The framework never changes roles or privileges. A role that is not set up correctly is refused with the reason.
 * - The target name must be `vf_` followed by 24 lowercase hex characters. Anything else is refused.
 * - The target name must not be the AI Product Builder database or the administration database.
 * - The database is created only if it does not already exist, so an existing database is never adopted.
 * - Connections are made only to the database this module created, and it is dropped after the attempt.
 */

export const VERIFICATION_DATABASE_PATTERN = /^vf_[a-f0-9]{24}$/;
const ADMIN_DATABASE = "postgres";

export { VERIFICATION_DATABASE_CONFIGURATION_MESSAGE, VERIFICATION_DATABASE_SETUP, verificationDatabaseAdminUrl } from "@/modules/verification/http/config";

/** Database name for one attempt: `vf_` plus the attempt identifier without dashes, truncated to 24 characters. */
export function verificationDatabaseName(attemptId: string) {
  const hex = attemptId.replace(/[^a-f0-9]/gi, "").toLowerCase().padEnd(24, "0").slice(0, 24);
  return `vf_${hex}`;
}

function databaseNameOf(url: string) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

/**
 * Refuses any name that is not a verification database, and any name that belongs to a database the framework must
 * never touch. Pure, so it can be tested without a server.
 */
export function assertVerificationDatabaseName(name: string, forbiddenNames: string[]) {
  if (!VERIFICATION_DATABASE_PATTERN.test(name)) {
    throw new Error("The database name is not a verification database name, so it was refused.");
  }
  const forbidden = new Set([ADMIN_DATABASE, ...forbiddenNames.filter(Boolean)]);
  if (forbidden.has(name)) throw new Error("The database name belongs to a database the verification framework must not use.");
}

export function assertAdminUrl(adminUrl: string, forbiddenNames: string[]) {
  const name = databaseNameOf(adminUrl);
  if (name && name !== ADMIN_DATABASE && forbiddenNames.filter(Boolean).includes(name)) {
    throw new Error("VERIFICATION_DATABASE_ADMIN_URL points at a database the verification framework must not use.");
  }
}

/** What the admin role can do, read from the server. Only read; nothing is granted or changed. */
export type AdminRoleFacts = {
  roleName: string;
  isSuperuser: boolean;
  canCreateDatabase: boolean;
  canCreateRole: boolean;
  bypassesRowSecurity: boolean;
  /** Non-template databases owned by the role. */
  ownedDatabases: string[];
};

/**
 * Decides whether the admin role is safe to use for disposable verification databases. Pure, so every rule is tested
 * without a server. `builderRoleName` is the role the AI Product Builder connects as; it must never be reused here.
 */
export function assessAdminRole(
  facts: AdminRoleFacts,
  context: { builderRoleName: string | null },
): { ok: true } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  if (facts.isSuperuser) {
    problems.push("The role is a PostgreSQL superuser. Create a dedicated role for verification that is not a superuser.");
  }
  if (!facts.canCreateDatabase) {
    problems.push("The role cannot create databases. Grant CREATEDB to the dedicated verification role.");
  }
  if (facts.canCreateRole) {
    problems.push("The role can create other roles. Remove CREATEROLE; verification does not need it.");
  }
  if (facts.bypassesRowSecurity) {
    problems.push("The role bypasses row-level security. Remove BYPASSRLS; verification does not need it.");
  }
  if (context.builderRoleName && facts.roleName === context.builderRoleName) {
    problems.push("The verification admin connects as the same role as the AI Product Builder. Use a separate role.");
  }
  const foreign = facts.ownedDatabases.filter((name) => name !== ADMIN_DATABASE && !VERIFICATION_DATABASE_PATTERN.test(name));
  if (foreign.length > 0) {
    problems.push(
      `The role owns databases that are not verification databases (${foreign.slice(0, 5).join(", ")}). Use a role that owns only verification databases.`,
    );
  }
  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}

/** Thrown when the admin role fails the preflight. The message is safe to show: it contains no credentials. */
export class VerificationDatabaseRoleError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`The verification database role is not set up safely. ${problems.join(" ")} ${VERIFICATION_DATABASE_SETUP_SUMMARY}`);
    this.name = "VerificationDatabaseRoleError";
    this.problems = problems;
  }
}

const VERIFICATION_DATABASE_SETUP_SUMMARY =
  "Set VERIFICATION_DATABASE_ADMIN_URL to a dedicated non-superuser role with CREATEDB only. See the setup instructions.";

/** The builder role name, read only to compare against the admin role. It is never used to connect. */
function builderRoleNameFromEnvironment(env: Record<string, string | undefined>) {
  const value = env.DATABASE_URL?.trim();
  if (!value) return null;
  try {
    return decodeURIComponent(new URL(value).username) || null;
  } catch {
    return null;
  }
}

/** Refuses an admin URL that is the builder's own connection string, even if the name differs. */
export function assertNotBuilderUrl(adminUrl: string, env: Record<string, string | undefined>) {
  if (env.DATABASE_URL && adminUrl === env.DATABASE_URL) {
    throw new Error("VERIFICATION_DATABASE_ADMIN_URL is the same as DATABASE_URL, so it was refused.");
  }
}

/**
 * Reads the admin role's attributes and ownership from the server, then applies `assessAdminRole`. It only runs
 * read-only catalogue queries. It never creates, alters or grants anything.
 */
export async function preflightAdminRole(adminUrl: string, env: Record<string, string | undefined> = process.env) {
  assertNotBuilderUrl(adminUrl, env);
  const admin = new URL(adminUrl);
  admin.pathname = `/${ADMIN_DATABASE}`;
  const client = clientFor(admin.toString());
  try {
    const roles = await client.$queryRaw<
      { roleName: string; isSuperuser: boolean; canCreateDatabase: boolean; canCreateRole: boolean; bypassesRowSecurity: boolean }[]
    >`SELECT current_user AS "roleName", rolsuper AS "isSuperuser", rolcreatedb AS "canCreateDatabase",
             rolcreaterole AS "canCreateRole", rolbypassrls AS "bypassesRowSecurity"
      FROM pg_roles WHERE rolname = current_user`;
    const owned = await client.$queryRaw<{ name: string }[]>`
      SELECT d.datname AS name FROM pg_database d
      JOIN pg_roles o ON o.oid = d.datdba
      WHERE o.rolname = current_user AND d.datistemplate = false`;
    const row = roles[0];
    if (!row) throw new VerificationDatabaseRoleError(["The role could not be read from the server."]);
    const verdict = assessAdminRole(
      { ...row, ownedDatabases: owned.map((item) => item.name) },
      { builderRoleName: builderRoleNameFromEnvironment(env) },
    );
    if (!verdict.ok) throw new VerificationDatabaseRoleError(verdict.problems);
    return { roleName: row.roleName };
  } finally {
    await client.$disconnect();
  }
}

/**
 * Drops a verification database left behind by an attempt that did not finish. Only names that match the
 * verification pattern are accepted, and the admin role is checked first. Safe to call when the database is gone.
 */
export async function dropOrphanedVerificationDatabase(input: {
  adminUrl: string;
  name: string;
  forbiddenNames: string[];
  env?: Record<string, string | undefined>;
}): Promise<{ dropped: boolean; reason: string }> {
  try {
    assertAdminUrl(input.adminUrl, input.forbiddenNames);
    assertVerificationDatabaseName(input.name, input.forbiddenNames);
    await preflightAdminRole(input.adminUrl, input.env ?? process.env);
  } catch (error) {
    return { dropped: false, reason: error instanceof Error ? error.message : "The database could not be dropped." };
  }
  const admin = new URL(input.adminUrl);
  admin.pathname = `/${ADMIN_DATABASE}`;
  const client = clientFor(admin.toString());
  try {
    await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${input.name}" WITH (FORCE)`);
    return { dropped: true, reason: "" };
  } catch (error) {
    return { dropped: false, reason: `The verification database could not be dropped: ${error instanceof Error ? error.message : "unknown error"}` };
  } finally {
    await client.$disconnect();
  }
}

export type VerificationDatabase = {
  name: string;
  /** Connection string for this database only. It is passed to the managed application and never logged. */
  url: string;
  /** Drops the database, terminating its connections. Safe to call more than once. */
  drop(): Promise<{ dropped: boolean; reason: string }>;
};

function clientFor(url: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

/**
 * Creates a new, empty database for one attempt. Schema application and seeding happen afterwards, against the
 * URL returned here. The admin role is checked first, and nothing is created if the check fails.
 */
export async function provisionVerificationDatabase(input: {
  adminUrl: string;
  attemptId: string;
  forbiddenNames: string[];
  env?: Record<string, string | undefined>;
}): Promise<VerificationDatabase> {
  assertAdminUrl(input.adminUrl, input.forbiddenNames);
  const name = verificationDatabaseName(input.attemptId);
  assertVerificationDatabaseName(name, input.forbiddenNames);
  await preflightAdminRole(input.adminUrl, input.env ?? process.env);

  const admin = new URL(input.adminUrl);
  admin.pathname = `/${ADMIN_DATABASE}`;
  const adminClient = clientFor(admin.toString());
  try {
    // The name is validated above and contains only [a-z0-9_], so quoting it is sufficient.
    await adminClient.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await adminClient.$disconnect();
  }

  const target = new URL(input.adminUrl);
  target.pathname = `/${name}`;
  const url = target.toString();
  let dropped = false;
  return {
    name,
    url,
    async drop() {
      if (dropped) return { dropped: true, reason: "The database was already dropped." };
      assertVerificationDatabaseName(name, input.forbiddenNames);
      const client = clientFor(admin.toString());
      try {
        await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        dropped = true;
        return { dropped: true, reason: "" };
      } catch (error) {
        return { dropped: false, reason: `The verification database could not be dropped: ${error instanceof Error ? error.message : "unknown error"}` };
      } finally {
        await client.$disconnect();
      }
    },
  };
}

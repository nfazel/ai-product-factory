import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  assertAdminUrl,
  assertNotBuilderUrl,
  assertVerificationDatabaseName,
  assessAdminRole,
  preflightAdminRole,
  provisionVerificationDatabase,
  type AdminRoleFacts,
  VerificationDatabaseRoleError,
  VERIFICATION_DATABASE_PATTERN,
  verificationDatabaseName,
} from "@/modules/verification/http/database";
import { verificationDatabaseAdminUrl, VERIFICATION_DATABASE_CONFIGURATION_MESSAGE } from "@/modules/verification/http/config";

const FORBIDDEN = ["ai_product_factory", "find_a_friend_dev"];
const REAL_ADMIN_URL = process.env.VERIFICATION_DATABASE_ADMIN_URL?.trim() || "";
/**
 * Creating and dropping databases needs a dedicated, non-superuser admin role. The write test therefore runs only when
 * a person opts in with APF_VERIFICATION_DB_TESTS=1. The read-only preflight test runs whenever an admin URL is set.
 */
const WRITE_TESTS_ENABLED = REAL_ADMIN_URL !== "" && process.env.APF_VERIFICATION_DB_TESTS === "1";

describe("verification database names", () => {
  it("derives a fresh name from the attempt identifier, without dashes, within the verification pattern", () => {
    expect(verificationDatabaseName("0f1e2d3c-4b5a-6978-8091-a2b3c4d5e6f7")).toBe("vf_0f1e2d3c4b5a69788091a2b3");
  });

  it("always produces a verification pattern name, even for an identifier with no hex characters", () => {
    const name = verificationDatabaseName("session_xyz");
    expect(name).toMatch(VERIFICATION_DATABASE_PATTERN);
    expect(name).toHaveLength(27);
  });

  it("gives two attempts different names", () => {
    expect(verificationDatabaseName(randomUUID())).not.toBe(verificationDatabaseName(randomUUID()));
  });

  it("accepts only verification database names, and never the admin, builder, or development databases", () => {
    expect(() => assertVerificationDatabaseName("vf_0f1e2d3c4b5a69788091a2b3", FORBIDDEN)).not.toThrow();
    expect(() => assertVerificationDatabaseName("ai_product_factory", FORBIDDEN)).toThrow(/not a verification database name/);
    expect(() => assertVerificationDatabaseName("find_a_friend_dev", FORBIDDEN)).toThrow(/not a verification database name/);
    expect(() => assertVerificationDatabaseName("betmyfriend_task2_smoke", FORBIDDEN)).toThrow(/not a verification database name/);
    expect(() => assertVerificationDatabaseName("postgres", FORBIDDEN)).toThrow(/not a verification database name/);
  });

  it("refuses a verification-shaped name that is also on the forbidden list", () => {
    expect(() => assertVerificationDatabaseName("vf_0f1e2d3c4b5a69788091a2b3", ["vf_0f1e2d3c4b5a69788091a2b3"])).toThrow(
      /must not use/,
    );
  });
});

describe("admin connection", () => {
  it("refuses an admin URL that points at a forbidden database, before any connection is made", () => {
    expect(() => assertAdminUrl("postgresql://u:p@127.0.0.1:5433/ai_product_factory", FORBIDDEN)).toThrow(/must not use/);
    expect(() => assertAdminUrl("postgresql://u:p@127.0.0.1:5433/postgres", FORBIDDEN)).not.toThrow();
  });

  it("refuses to provision when the admin URL targets the builder database, and never reaches the server", async () => {
    await expect(
      provisionVerificationDatabase({
        adminUrl: "postgresql://u:p@127.0.0.1:1/ai_product_factory",
        attemptId: randomUUID(),
        forbiddenNames: FORBIDDEN,
      }),
    ).rejects.toThrow(/must not use/);
  });

  it("reads the admin URL only from VERIFICATION_DATABASE_ADMIN_URL, never from DATABASE_URL", () => {
    expect(verificationDatabaseAdminUrl({ DATABASE_URL: "postgresql://u:p@127.0.0.1:5433/ai_product_factory" })).toBeNull();
    expect(verificationDatabaseAdminUrl({ VERIFICATION_DATABASE_ADMIN_URL: "   " })).toBeNull();
    expect(verificationDatabaseAdminUrl({ VERIFICATION_DATABASE_ADMIN_URL: "postgresql://admin@127.0.0.1:5433/postgres" })).toBe(
      "postgresql://admin@127.0.0.1:5433/postgres",
    );
  });

  it("says plainly what to configure when the admin URL is missing", () => {
    expect(VERIFICATION_DATABASE_CONFIGURATION_MESSAGE).toMatch(/VERIFICATION_DATABASE_ADMIN_URL/);
    expect(VERIFICATION_DATABASE_CONFIGURATION_MESSAGE).toMatch(/never falls back to DATABASE_URL/);
  });
});

/** The role name in a connection string, read without connecting. Used only to compare roles. */
function roleNameOf(url: string): string | null {
  try {
    return decodeURIComponent(new URL(url).username) || null;
  } catch {
    return null;
  }
}

// Pure rules. Every unsafe admin role is refused and the safe baseline is accepted. These run on every machine.
describe("admin role rules reject unsafe configurations (pure)", () => {
  const SAFE: AdminRoleFacts = {
    roleName: "apf_verifier",
    isSuperuser: false,
    canCreateDatabase: true,
    canCreateRole: false,
    bypassesRowSecurity: false,
    ownedDatabases: [],
  };
  const context = { builderRoleName: "apf" };

  it("accepts the safe baseline: a dedicated role that owns only verification databases", () => {
    expect(assessAdminRole(SAFE, context)).toEqual({ ok: true });
    expect(assessAdminRole({ ...SAFE, ownedDatabases: ["vf_0f1e2d3c4b5a69788091a2b3"] }, context)).toEqual({ ok: true });
  });

  it.each([
    ["a superuser", { isSuperuser: true }, /superuser/],
    ["a role that cannot create databases", { canCreateDatabase: false }, /cannot create databases/],
    ["a role that can create other roles", { canCreateRole: true }, /create other roles/],
    ["a role that bypasses row-level security", { bypassesRowSecurity: true }, /row-level security/],
    ["the AI Product Builder's own role", { roleName: "apf" }, /same role as the AI Product Builder/],
    ["a role that owns ai_product_factory", { ownedDatabases: ["ai_product_factory"] }, /not verification databases/],
    [
      "a role that owns a non-verification database",
      { ownedDatabases: ["postgres", "betmyfriend_task2_smoke"] },
      /not verification databases/,
    ],
  ])("refuses %s, and says what to change", (_label, change, reason) => {
    const verdict = assessAdminRole({ ...SAFE, ...change }, context);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.problems.length).toBeGreaterThan(0);
    expect(verdict.problems.join(" ")).toMatch(reason);
  });

  it("refuses an admin URL identical to DATABASE_URL, even when the role is otherwise safe", () => {
    const url = "postgresql://apf_verifier:placeholder@127.0.0.1:5433/postgres";
    expect(() => assertNotBuilderUrl(url, { DATABASE_URL: url })).toThrow(/same as DATABASE_URL/);
    expect(() =>
      assertNotBuilderUrl(url, { DATABASE_URL: "postgresql://apf:placeholder@127.0.0.1:5433/ai_product_factory" }),
    ).not.toThrow();
  });
});

// Real cluster, read-only. The configured admin role is checked, and a builder-role collision is refused. Nothing is
// created, altered, or granted, and only the verifier's own credentials are used. These run only when
// VERIFICATION_DATABASE_ADMIN_URL is set.
describe.skipIf(!REAL_ADMIN_URL)("verification admin role (real cluster, read-only)", () => {
  it("asserts a safe configuration: the admin URL is not a forbidden database, the preflight passes, and the role is not the builder's", async () => {
    const configuredRole = roleNameOf(REAL_ADMIN_URL);
    expect(configuredRole).not.toBeNull();
    expect(() => assertAdminUrl(REAL_ADMIN_URL, FORBIDDEN)).not.toThrow();

    const facts = await preflightAdminRole(REAL_ADMIN_URL, process.env);
    expect(facts.roleName).toBe(configuredRole);

    const builderRole = roleNameOf(process.env.DATABASE_URL ?? "");
    if (builderRole) expect(facts.roleName).not.toBe(builderRole);
  }, 30_000);

  it("refuses the configured admin role when the builder is recorded as using the same role, and does not leak the password", async () => {
    const role = new URL(REAL_ADMIN_URL).username;
    const builderEnvironment = { DATABASE_URL: `postgresql://${role}@127.0.0.1:5433/ai_product_factory` };

    const error = await preflightAdminRole(REAL_ADMIN_URL, builderEnvironment).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(VerificationDatabaseRoleError);
    const problems = (error as VerificationDatabaseRoleError).problems.join(" ");
    expect(problems).toMatch(/same role as the AI Product Builder/);

    const password = decodeURIComponent(new URL(REAL_ADMIN_URL).password);
    if (password) expect(String((error as Error).message)).not.toContain(password);
  }, 30_000);
});

describe.skipIf(!WRITE_TESTS_ENABLED)("verification database provisioning (real cluster, dedicated role only)", () => {
  it("provisions a fresh database per attempt, isolates the two, and drops each one", async () => {
    const first = await provisionVerificationDatabase({ adminUrl: REAL_ADMIN_URL, attemptId: randomUUID(), forbiddenNames: FORBIDDEN });
    const second = await provisionVerificationDatabase({ adminUrl: REAL_ADMIN_URL, attemptId: randomUUID(), forbiddenNames: FORBIDDEN });
    try {
      expect(first.name).toMatch(VERIFICATION_DATABASE_PATTERN);
      expect(second.name).toMatch(VERIFICATION_DATABASE_PATTERN);
      expect(first.name).not.toBe(second.name);
      expect(new URL(first.url).pathname).toBe(`/${first.name}`);
      expect(first.url).not.toBe(second.url);
    } finally {
      expect(await first.drop()).toEqual({ dropped: true, reason: "" });
      expect(await second.drop()).toEqual({ dropped: true, reason: "" });
    }
    // Dropping again is safe and reports the database as gone.
    expect((await first.drop()).dropped).toBe(true);
  }, 60_000);
});

import { describe, expect, it } from "vitest";

import { assertNotBuilderUrl, assessAdminRole, type AdminRoleFacts } from "@/modules/verification/http/database";
import { VERIFICATION_DATABASE_SETUP, VERIFICATION_DATABASE_CONFIGURATION_MESSAGE } from "@/modules/verification/http/config";

const safe: AdminRoleFacts = {
  roleName: "apf_verifier",
  isSuperuser: false,
  canCreateDatabase: true,
  canCreateRole: false,
  bypassesRowSecurity: false,
  ownedDatabases: ["vf_0123456789abcdef01234567"],
};

describe("admin role preflight", () => {
  it("accepts a dedicated role that can only create and own verification databases", () => {
    expect(assessAdminRole(safe, { builderRoleName: "apf" })).toEqual({ ok: true });
  });

  it("refuses a superuser, and says how to fix it", () => {
    const verdict = assessAdminRole({ ...safe, isSuperuser: true }, { builderRoleName: "apf" });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problems.join(" ")).toMatch(/superuser.*dedicated role/);
  });

  it("refuses a role that cannot create databases", () => {
    const verdict = assessAdminRole({ ...safe, canCreateDatabase: false }, { builderRoleName: "apf" });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problems.join(" ")).toMatch(/CREATEDB/);
  });

  it("refuses a role that can create other roles or bypass row-level security", () => {
    const verdict = assessAdminRole({ ...safe, canCreateRole: true, bypassesRowSecurity: true }, { builderRoleName: "apf" });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.problems.join(" ")).toMatch(/CREATEROLE/);
      expect(verdict.problems.join(" ")).toMatch(/BYPASSRLS/);
    }
  });

  it("refuses the builder's own role", () => {
    const verdict = assessAdminRole({ ...safe, roleName: "apf" }, { builderRoleName: "apf" });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problems.join(" ")).toMatch(/same role as the AI Product Builder/);
  });

  it("refuses a role that owns databases which are not verification databases", () => {
    const verdict = assessAdminRole({ ...safe, ownedDatabases: ["ai_product_factory", "vf_0123456789abcdef01234567"] }, { builderRoleName: "apf" });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problems.join(" ")).toMatch(/ai_product_factory/);
  });

  it("refuses an admin URL that is the builder's DATABASE_URL, even under another name", () => {
    const url = "postgresql://apf_verifier:pw@127.0.0.1:5433/postgres";
    expect(() => assertNotBuilderUrl(url, { DATABASE_URL: url })).toThrow(/same as DATABASE_URL/);
    expect(() => assertNotBuilderUrl(url, { DATABASE_URL: "postgresql://apf:pw@127.0.0.1:5433/ai_product_factory" })).not.toThrow();
  });

  it("documents setup with a placeholder password and no real credential", () => {
    expect(VERIFICATION_DATABASE_SETUP).toMatch(/CREATEDB NOSUPERUSER NOCREATEROLE NOBYPASSRLS/);
    expect(VERIFICATION_DATABASE_SETUP).toMatch(/<choose-a-strong-password>/);
    expect(VERIFICATION_DATABASE_SETUP).not.toMatch(/password123|secret|postgres:postgres/i);
    expect(VERIFICATION_DATABASE_CONFIGURATION_MESSAGE).toMatch(/never falls back to DATABASE_URL/);
  });
});

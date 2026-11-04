import { beforeEach, describe, expect, it, vi } from "vitest";

import { authorityWording, manifestIsAuthentic, signManifest, type RunAuthorityManifest } from "@/modules/run-authority/manifest";

const KEY = "synthetic-run-authority-key-32-bytes-long!!";
const manifest = (): RunAuthorityManifest => ({
  kind: "RUN_AUTHORITY",
  version: 1,
  productId: "p1",
  planId: "plan1",
  tasks: [{ id: "t1", title: "One" }],
  steps: ["APPROVE_TASK", "APPROVE_PLAN", "APPROVE_CODE", "RECORD_SNAPSHOT", "SIGN_RUNTIME_REVIEW", "START_VERIFICATION"],
  riskCeiling: "LOW",
  maxRetries: 2,
  excludes: ["Accept a feature"],
  grantedAt: "2026-11-04T10:00:00.000Z",
  expiresAt: "2026-11-11T10:00:00.000Z",
  operator: { kind: "LOCAL_OPERATOR", id: "op", name: "Local operator" },
});

beforeEach(() => vi.stubEnv("EXTERNAL_REVIEW_APPROVAL_KEY", KEY));

describe("run authority signature", () => {
  it("accepts the manifest it signed", () => {
    const { digest, signature } = signManifest(manifest());
    expect(manifestIsAuthentic(manifest(), digest, signature)).toBe(true);
  });

  it("refuses a manifest that was changed after signing, such as a wider scope or a longer expiry", () => {
    const { digest, signature } = signManifest(manifest());
    expect(manifestIsAuthentic({ ...manifest(), expiresAt: "2027-01-01T00:00:00.000Z" }, digest, signature)).toBe(false);
    expect(manifestIsAuthentic({ ...manifest(), tasks: [...manifest().tasks, { id: "t2", title: "Sneaked in" }] }, digest, signature)).toBe(false);
    expect(manifestIsAuthentic({ ...manifest(), riskCeiling: "HIGH" as never }, digest, signature)).toBe(false);
  });

  it("refuses a signature made with a different key, and malformed values", () => {
    const { digest, signature } = signManifest(manifest());
    vi.stubEnv("EXTERNAL_REVIEW_APPROVAL_KEY", "a-completely-different-key-of-32-bytes!!");
    expect(manifestIsAuthentic(manifest(), digest, signature)).toBe(false);
    expect(manifestIsAuthentic(manifest(), "nope", "nope")).toBe(false);
  });

  it("says plainly that the Builder acted, under whose authority", () => {
    expect(authorityWording("abc", "Local operator")).toBe("Builder, under authority abc granted by Local operator");
  });
});

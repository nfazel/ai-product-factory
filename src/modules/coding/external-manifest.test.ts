import { describe, expect, it } from "vitest";
import { inspectExternalFile, scopeDigest, manifestDigest, requireReviewCredential, signReview, validReview, type ExternalScope, type ExternalManifest, type ReviewAttestation } from "@/modules/coding/external-manifest";

const key = "local-test-operator-key-32-bytes-or-more";
function scope(): ExternalScope {
  return { productId: "p", taskId: "t", workspaceId: "w", baseCommit: "a".repeat(40), plan: { version: 4, approvedAt: new Date("2026-10-29"), approvedBy: "Human", summary: "Preserve security", filesExpectedToChange: ["security.ts", "migration.sql", "schema.prisma", "check.test.ts", ".env"], steps: ["Review security"], setupCommands: [], validationCommands: [{ command: "npm test" }], validationPlan: "Run tests" }, contract: { allowedPaths: ["**"], restrictedPaths: [], maxFiles: 8, allowFileDelete: false, sourceFingerprint: "policy", objective: "Upgrade", architectureConstraints: "Preserve", codingPolicyConstraints: "No bypass", acceptanceCriteria: ["Secure behavior"], requiredChecks: ["npm test"], dependencies: [], validationExpectations: "Behavior", executionMode: "SUPERVISED", riskLevel: "HIGH" } };
}
function fixture() {
  const context = scope();
  const inspected = inspectExternalFile({ path: "security.ts", before: Buffer.from("export function getSession() { return oldSession(); }"), after: Buffer.from("export function getSession() { return secureSession(); }"), beforeMode: "100644", afterMode: "100644" }, context);
  const manifest: ExternalManifest = { version: 1, productId: "p", taskId: "t", workspaceId: "w", baseCommit: "a".repeat(40), sourceCommit: "b".repeat(40), tree: "c".repeat(40), scopeHash: scopeDigest(context), files: [inspected.file] };
  const review: ReviewAttestation = { kind: "EXTERNAL_CHANGE_REVIEW", manifest, approvalId: "human-approval", digest: manifestDigest(manifest), reviewedIssues: manifest.files.flatMap(file => file.issues.map(reason => ({ path: file.path, reason }))), actor: { id: "human", name: "Human" }, reason: "I reviewed the exact authentication change.", approvedAt: "2026-10-29T12:00:00.000Z" };
  return { manifest, review, signature: signReview(review, key) };
}
describe("exact-content external review", () => {
  it("requires the configured operator credential, with no fallback", () => {
    expect(() => requireReviewCredential("wrong", key)).toThrow(/authorization/);
    expect(() => requireReviewCredential(key, undefined)).toThrow(/disabled/);
    expect(() => requireReviewCredential(key, "short")).toThrow(/disabled/);
    expect(() => requireReviewCredential(key, key)).not.toThrow();
  });
  it("accepts only a valid signed exact manifest and all explicitly reviewed flags", () => {
    const { manifest, review, signature } = fixture();
    expect(validReview(review, signature, key, manifest)).toBe(true);
    expect(validReview({ ...review, reviewedIssues: [] }, signature, key, manifest)).toBe(false);
    expect(validReview(review, "0".repeat(64), key, manifest)).toBe(false);
    expect(validReview(review, signature, undefined, manifest)).toBe(false);
    expect(validReview(review, signature, key + "rotated", manifest)).toBe(false);
  });
  it.each(["productId", "taskId", "workspaceId", "baseCommit", "sourceCommit", "tree", "scopeHash"] as const)("rejects another %s", field => {
    const { manifest, review, signature } = fixture();
    expect(validReview(review, signature, key, { ...manifest, [field]: "different" })).toBe(false);
  });
  it("rejects changed files, content, modes and new flags", () => {
    const { manifest, review, signature } = fixture();
    for (const file of [{ ...manifest.files[0], afterHash: "changed" }, { ...manifest.files[0], beforeHash: null }, { ...manifest.files[0], afterMode: "100755" }, { ...manifest.files[0], issues: [...manifest.files[0].issues, "new issue"] }]) expect(validReview(review, signature, key, { ...manifest, files: [file] })).toBe(false);
  });
  it("binds approval to plan, contract, criteria and commands", () => {
    const before = scope();
    for (const updated of [{ ...before, plan: { ...before.plan, version: 5 } }, { ...before, plan: { ...before.plan, steps: [] } }, { ...before, contract: { ...before.contract, maxFiles: 9 } }, { ...before, contract: { ...before.contract, restrictedPaths: ["security.ts"] } }]) expect(scopeDigest(updated)).not.toBe(scopeDigest(before));
  });
  it("does not make secrets, scope violations, symlinks, model removal or weakened tests waivable", () => {
    for (const input of [
      { path: ".env", before: null, after: Buffer.from("SECRET=value"), beforeMode: null, afterMode: "100644" },
      { path: "outside.ts", before: null, after: Buffer.from("export const x = 1;"), beforeMode: null, afterMode: "100644" },
      { path: "security.ts", before: null, after: Buffer.from("/outside"), beforeMode: null, afterMode: "120000" },
      { path: "schema.prisma", before: Buffer.from("model Account { id String @id }"), after: Buffer.from(""), beforeMode: "100644", afterMode: "100644" },
      { path: "check.test.ts", before: Buffer.from("assert.equal(actual, expected);"), after: Buffer.from(""), beforeMode: "100644", afterMode: "100644" },
    ]) expect(inspectExternalFile(input, scope()).hard.length).toBeGreaterThan(0);
  });
});

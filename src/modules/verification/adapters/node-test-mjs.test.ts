import { describe, expect, it } from "vitest";

import { nodeTestMjsAdapter } from "@/modules/verification/adapters/node-test-mjs";
import { approveVerificationCommand, isVerificationTestPath } from "@/modules/verification/policy";
import type { ImplementationProfile } from "@/modules/verification/inspection";

const PROFILE: ImplementationProfile = {
  packageManager: "npm",
  typescript: false,
  frameworks: [],
  testRunners: [],
  scripts: [],
  dependencies: [],
  routes: [],
  components: [],
  existingTests: [],
  plainJavaScriptSources: 2,
  typeScriptSources: 0,
};

describe("node-test-mjs adapter", () => {
  it("proposes exactly the command the runner used before adapters, and the command gate approves it", () => {
    const file = "verification/claim/submit.test.mjs";
    expect(nodeTestMjsAdapter.commandFor(file)).toBe(`node --test ${file}`);
    const approved = approveVerificationCommand(nodeTestMjsAdapter.commandFor(file));
    expect(approved.ok).toBe(true);
    expect(approved.ok && approved.command).toBe(`node --test ${file}`);
  });

  it("accepts only verification/ test files with the .test.mjs suffix", () => {
    expect(nodeTestMjsAdapter.acceptsFile("verification/claim/submit.test.mjs")).toBe(true);
    expect(nodeTestMjsAdapter.acceptsFile("src/claims/submit.test.mjs")).toBe(false);
    expect(nodeTestMjsAdapter.acceptsFile("verification/claim/submit.test.ts")).toBe(false);
    expect(nodeTestMjsAdapter.acceptsFile("verification/claim/submit.mjs")).toBe(false);
  });

  it("does not accept HTTP acceptance files, which belong to the http-blackbox adapter", () => {
    expect(nodeTestMjsAdapter.acceptsFile("verification/http/discovery.test.mjs")).toBe(false);
    expect(nodeTestMjsAdapter.acceptsFile("verification/claim/submit.test.mjs")).toBe(true);
  });

  it("refuses traversal out of verification/, in the file rule and in the command gate", () => {
    expect(isVerificationTestPath("verification/../src/claims/submit.test.mjs")).toBe(false);
    expect(nodeTestMjsAdapter.acceptsFile("verification/../src/claims/submit.test.mjs")).toBe(false);
    const approved = approveVerificationCommand("node --test verification/../src/claims/submit.test.mjs");
    expect(approved.ok).toBe(false);
  });

  it("does not widen the command gate: other node invocations and flags stay refused", () => {
    expect(approveVerificationCommand("node src/index.mjs").ok).toBe(false);
    expect(approveVerificationCommand("node --test --watch verification/a.test.mjs").ok).toBe(false);
    expect(approveVerificationCommand("node --test verification/a.test.mjs; rm -rf .").ok).toBe(false);
  });

  it("is available only when plain JavaScript product modules exist", () => {
    expect(nodeTestMjsAdapter.detect(PROFILE).available).toBe(true);
    const unavailable = nodeTestMjsAdapter.detect({ ...PROFILE, plainJavaScriptSources: 0, typeScriptSources: 4, typescript: true });
    expect(unavailable.available).toBe(false);
    expect(unavailable.reason).toMatch(/cannot load TypeScript or JSX/);
  });

  it("classifies a passing run as PASSED and a missing module as an environment failure, not a product failure", () => {
    const passed = nodeTestMjsAdapter.classify({
      exitCode: 0,
      output: "# tests 1\n# pass 1\n# fail 0\n# skipped 0",
      timedOut: false,
    });
    expect(passed).toMatchObject({ category: "PASSED", status: "PASSED" });

    const missing = nodeTestMjsAdapter.classify({
      exitCode: 1,
      output: "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'left-pad'",
      timedOut: false,
    });
    expect(missing).toMatchObject({ category: "ENVIRONMENT_FAILURE", status: "BLOCKED" });
  });

  it("classifies an assertion failure as a product failure and a timeout as an infrastructure stop", () => {
    const assertion = nodeTestMjsAdapter.classify({
      exitCode: 1,
      output: "# tests 1\n# pass 0\n# fail 1\nAssertionError [ERR_ASSERTION]: Expected values to be strictly equal",
      timedOut: false,
    });
    expect(assertion).toMatchObject({ category: "PRODUCT_FAILURE", status: "FAILED" });

    const timedOut = nodeTestMjsAdapter.classify({ exitCode: null, output: "", timedOut: true });
    expect(timedOut).toMatchObject({ category: "INFRASTRUCTURE_FAILURE", status: "BLOCKED" });
  });

  it("declares its contract: node-only, MODULE_EXPORT, no setup, and it can generate and execute", () => {
    expect(nodeTestMjsAdapter).toMatchObject({
      id: "node-test-mjs",
      surfaces: ["MODULE_EXPORT"],
      setupRequired: false,
      canGenerate: true,
      canExecute: true,
      requiredDependencies: [],
    });
    expect(nodeTestMjsAdapter.technologies).toEqual([{ runtime: "node", language: "javascript" }]);
  });
});

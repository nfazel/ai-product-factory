import { describe, expect, it } from "vitest";

import type { CompiledExecutionContract } from "@/modules/coding/commands";
import { codingRetryDecision, executionContractsMatch, filesChangedByRun } from "@/modules/coding/retry";

const contract: CompiledExecutionContract = {
  planVersion: 2,
  allowedFiles: ["package.json", "src/lib/db.ts"],
  setupCommands: ["npm install"],
  validationCommands: [{
    command: "npm run build",
    kind: "VALIDATION",
    applicability: "REQUIRED",
    reason: "package.json defines a build script.",
  }],
  notApplicableChecks: [],
  executableCommands: ["npm install", "npm run build"],
};

function decision(patch: Partial<Parameters<typeof codingRetryDecision>[0]> = {}) {
  return codingRetryDecision({
    stale: false,
    workspaceStatus: "FAILED",
    planStatus: "APPROVED",
    approvedAt: "2026-10-13T14:37:48.365Z",
    contractReady: true,
    contractBlocker: null,
    runStatus: "FAILED",
    errorCategory: "PROVIDER_UNAVAILABLE",
    storedContract: contract,
    currentContract: contract,
    ...patch,
  });
}

describe("coding retry", () => {
  it("offers retry only for the same approved contract", () => {
    expect(decision().offer).toBe(true);
    expect(decision({ errorCategory: "RATE_LIMITED" }).offer).toBe(true);
    expect(decision({ errorCategory: "TIMEOUT" }).offer).toBe(true);
    expect(decision({ errorCategory: null }).offer).toBe(false);
    expect(decision({ errorCategory: null }).reason).toMatch(/not retried/);
    expect(decision({ planStatus: "PROPOSED", approvedAt: null }).reason).toMatch(/approval is required/);
    expect(decision({ planStatus: "CHANGES_REQUESTED" }).reason).toMatch(/changed after the failed coding run/);
    expect(decision({
      currentContract: { ...contract, planVersion: 3 },
    }).reason).toMatch(/different contract/);
    expect(decision({ stale: true }).offer).toBe(false);
    expect(decision({ contractReady: false, contractBlocker: "npm test is not permitted." }).offer).toBe(false);
  });

  it("matches a stored contract by its compiled identity", () => {
    expect(executionContractsMatch(contract, contract)).toBe(true);
    expect(executionContractsMatch({ ...contract, allowedFiles: ["package.json"] }, contract)).toBe(false);
    expect(executionContractsMatch({ setupCommands: contract.setupCommands }, contract)).toBe(false);
  });

  it("counts file writes without treating reads as changes", () => {
    expect(filesChangedByRun([
      { action: "READ_FILE", allowed: true, path: "README.md" },
      { action: "WRITE_FILE", allowed: true, path: "package.json" },
      { action: "CREATE_FILE", allowed: false, path: "secret.env" },
      { action: "CREATE_FILE", allowed: true, path: "src/lib/db.ts" },
    ])).toEqual(["package.json", "src/lib/db.ts"]);
  });
});

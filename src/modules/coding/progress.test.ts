import { describe, expect, it } from "vitest";

import { approvedPlanWasExecuted, classifyCodingRun, codingRunFromWorkspace, describeCodingProgress, snapshotCodingRun, type CodingProgressInput } from "@/modules/coding/progress";

const steps = [
  "Initialize package.json with dependencies.",
  "Configure tsconfig.json for TypeScript.",
  "Create prisma/schema.prisma defining the datasource.",
  "Create src/lib/db.ts to export the client.",
];

function input(patch: Partial<CodingProgressInput> = {}): CodingProgressInput {
  return {
    workspaceStatus: "ACTIVE",
    planStatus: "APPROVED",
    planVersion: 1,
    planApprovedBy: "Local user",
    planSteps: steps,
    requiredChecks: ["npm run build", "prisma validate", "unit tests execution"],
    agentRunStatus: null,
    agentPhase: null,
    startedAt: null,
    openEscalations: [],
    events: [],
    evidence: [],
    files: [],
    ...patch,
  };
}

describe("coding progress", () => {
  it("keeps an approved plan that has not been executed in READY", () => {
    const view = describeCodingProgress(input());
    expect(view.lifecycle).toBe("READY");
    expect(view.steps.map((step) => step.state)).toEqual(["PENDING", "PENDING", "PENDING", "PENDING"]);
    expect(view.checks.map((check) => check.state)).toEqual(["NOT_RUN", "NOT_RUN", "NOT_RUN"]);
  });

  it("does not mark missing planned files FAILED before an implement attempt", () => {
    const view = describeCodingProgress(input({
      planStatus: "PROPOSED",
      currentPlanExecuted: false,
      agentPhase: "plan",
      agentRunStatus: "COMPLETED",
      implementationGaps: [
        { path: "src/app/api/discovery/feed/route.ts" },
        { path: "src/app/api/discovery/action/route.ts" },
        { path: "src/app/discovery/page.tsx" },
      ],
      planSteps: [
        "Create src/app/api/discovery/feed/route.ts.",
        "Create src/app/api/discovery/action/route.ts.",
        "Create src/app/discovery/page.tsx.",
        "Install dependencies with npm install.",
        "Run the Next.js production build with npm run build.",
      ],
    }));
    expect(view.lifecycle).toBe("NONE");
    expect(view.steps.map((step) => step.state)).toEqual([
      "PENDING",
      "PENDING",
      "PENDING",
      "PENDING",
      "PENDING",
    ]);
    expect(view.log).toEqual([]);
  });

  it("keeps a failed run failed when the plan was left executing", () => {
    const view = describeCodingProgress(input({
      workspaceStatus: "FAILED",
      planStatus: "EXECUTING",
      agentRunStatus: "FAILED",
      agentPhase: "implement",
    }));
    expect(view.lifecycle).toBe("FAILED");
  });

  it("shows a running implement phase without marking later steps complete", () => {
    const view = describeCodingProgress(input({
      planStatus: "EXECUTING",
      agentRunStatus: "RUNNING",
      agentPhase: "implement",
      events: [{ at: "2026-10-13T13:40:00.000Z", action: "CREATE_FILE", allowed: true, path: "package.json", command: "", reason: "" }],
    }));
    expect(view.lifecycle).toBe("RUNNING");
    expect(view.steps.map((step) => step.state)).toEqual(["COMPLETED", "RUNNING", "PENDING", "PENDING"]);
    expect(view.currentStep?.index).toBe(2);
  });

  it("records written files, failed checks, and a refused path from saved events", () => {
    const view = describeCodingProgress(input({
      agentRunStatus: "COMPLETED",
      agentPhase: "implement",
      events: [
        { at: "2026-10-12T12:14:20.784Z", action: "CREATE_FILE", allowed: true, path: "package.json", command: "", reason: "" },
        { at: "2026-10-12T12:14:20.798Z", action: "CREATE_FILE", allowed: true, path: "tsconfig.json", command: "", reason: "" },
        { at: "2026-10-12T12:14:20.806Z", action: "CREATE_FILE", allowed: false, path: "prisma/schema.prisma", command: "", reason: "The directory does not exist inside the workspace." },
        { at: "2026-10-12T12:14:20.819Z", action: "RUN_COMMAND", allowed: false, path: "", command: "npm install", reason: "That command is not an approved check." },
      ],
      evidence: [
        { id: "build-1", description: "npm run build", command: "npm run build", result: "FAIL", exitCode: 1, at: "2026-10-12T12:14:22.625Z" },
        { id: "prisma-1", description: "prisma validate", command: "prisma validate", result: "NOT RUN", exitCode: null, at: "2026-10-12T12:14:22.630Z" },
        { id: "test-1", description: "unit tests execution", command: "npm test", result: "FAIL", exitCode: 1, at: "2026-10-12T12:14:23.010Z" },
      ],
      files: [
        { path: "package.json", status: "added" },
        { path: "tsconfig.json", status: "added" },
      ],
      openEscalations: [{
        type: "POLICY_CONFLICT",
        description: "That command is not an approved check.",
        reason: "That command is not an approved check.",
        recommendedAction: "Use an approved check.",
      }],
    }));
    expect(view.lifecycle).toBe("WAITING_FOR_HUMAN");
    expect(view.steps.map((step) => step.state)).toEqual(["COMPLETED", "COMPLETED", "FAILED", "BLOCKED"]);
    expect(view.files.created).toEqual(["package.json", "tsconfig.json"]);
    expect(view.files.modified).toEqual([]);
    expect(view.files.deleted).toEqual([]);
    expect(view.checks.map((check) => check.state)).toEqual(["FAILED", "NOT_RUN", "FAILED"]);
    expect(view.log.some((entry) => entry.text.startsWith("Created package.json"))).toBe(true);
    expect(view.log.some((entry) => entry.text.includes("prisma/schema.prisma"))).toBe(true);
    expect(view.failures.some((failure) => failure.what === "prisma/schema.prisma" && failure.step === "Step 3")).toBe(true);
    expect(view.synchronous).toBe(true);
  });

  it("shows a setup failure caused by the generated schema as setup, not validation", () => {
    const view = describeCodingProgress(input({
      workspaceStatus: "FAILED",
      planStatus: "APPROVED",
      agentPhase: "implement",
      agentRunStatus: "COMPLETED",
      setupCommands: ["npm install", "npx prisma generate"],
      implementationIncomplete: true,
      implementationGaps: [{ path: "prisma/schema.prisma" }],
      planSteps: ["Create prisma/schema.prisma defining the PostgreSQL datasource and initial schema models."],
      evidence: [{
        id: "generate-1",
        description: "npx prisma generate",
        command: "npx prisma generate",
        result: "FAIL",
        exitCode: 1,
        output: "You don't have any models defined in your schema.prisma",
        at: "2026-10-14T13:12:38.322Z",
      }],
    }));
    expect(view.failureGroups.map((group) => group.label)).toContain("Setup");
    expect(view.failureGroups.map((group) => group.label)).not.toContain("Validation");
    expect(view.failures[0]?.step).toBe("Setup");
    expect(view.failures[0]?.message).toMatch(/implementation incomplete/);
    expect(view.failures[0]?.id).toBe("generate-1");
    expect(view.steps[0]?.state).toBe("FAILED");
  });

  it("does not treat a proposed revision as already executed", () => {
    expect(approvedPlanWasExecuted(
      { status: "PROPOSED", version: 4, approvedAt: null },
      { startedAt: "2026-10-13T21:51:32.655Z", input: { phase: "implement", planVersion: 2 } },
    )).toBe(false);
    expect(classifyCodingRun(input({
      workspaceStatus: "FAILED",
      planStatus: "PROPOSED",
      planVersion: 4,
      currentPlanExecuted: false,
      agentPhase: null,
      agentRunStatus: null,
    }))).toBe("NONE");
  });

  it("treats a proposed revision on an implemented workspace as waiting for plan approval", () => {
    expect(classifyCodingRun(input({
      workspaceStatus: "READY_FOR_REVIEW",
      planStatus: "PROPOSED",
      planVersion: 3,
      currentPlanExecuted: false,
      agentPhase: null,
      agentRunStatus: null,
    }))).toBe("WAITING_FOR_HUMAN");
    expect(classifyCodingRun(input({
      workspaceStatus: "COMPLETED",
      planStatus: "ESCALATED",
      planVersion: 3,
      currentPlanExecuted: false,
      agentPhase: null,
      agentRunStatus: null,
    }))).toBe("WAITING_FOR_HUMAN");
  });

  it("keeps an earlier failed run from blocking a newer approved plan", () => {
    expect(approvedPlanWasExecuted(
      { status: "APPROVED", version: 2, approvedAt: "2026-10-13T14:37:48.365Z" },
      { startedAt: "2026-10-12T12:14:18.029Z", input: { phase: "implement", continue: true } },
    )).toBe(false);
    expect(classifyCodingRun(input({
      planVersion: 2,
      currentPlanExecuted: false,
      agentPhase: "implement",
      agentRunStatus: "COMPLETED",
      evidence: [{ id: "test-2", description: "unit tests execution", command: "npm test", result: "FAIL", exitCode: 1, at: "2026-10-12T12:14:23.010Z" }],
      events: [{ at: "2026-10-12T12:14:20.819Z", action: "RUN_COMMAND", allowed: false, path: "", command: "npm install", reason: "That command is not an approved check." }],
    }))).toBe("READY");
  });

  it("keeps the original run failed in history while a later repair makes the workspace ready for review", () => {
    const view = describeCodingProgress(input({
      workspaceStatus: "READY_FOR_REVIEW",
      planStatus: "COMPLETED",
      planVersion: 4,
      agentPhase: "implement",
      agentRunStatus: "FAILED",
      requiredChecks: ["npx prisma validate", "npm run build"],
      evidence: [
        { id: "validate-old", description: "npx prisma validate", command: "npx prisma validate", result: "NOT RUN", exitCode: null, at: "2026-10-14T13:12:38.000Z" },
        { id: "build-old", description: "npm run build", command: "npm run build", result: "NOT RUN", exitCode: null, at: "2026-10-14T13:12:38.000Z" },
        { id: "generate-old", description: "npx prisma generate", command: "npx prisma generate", result: "FAIL", exitCode: 1, at: "2026-10-14T13:12:38.000Z" },
        { id: "generate-new", description: "npx prisma generate", command: "npx prisma generate", result: "PASS", exitCode: 0, at: "2026-10-14T17:13:41.000Z" },
        { id: "validate-new", description: "npx prisma validate", command: "npx prisma validate", result: "PASS", exitCode: 0, at: "2026-10-14T17:13:42.000Z" },
        { id: "build-new", description: "npm run build", command: "npm run build", result: "PASS", exitCode: 0, at: "2026-10-14T17:13:59.000Z" },
      ],
      files: [{ path: "prisma/schema.prisma", status: "added" }],
    }));
    expect(view.lifecycle).toBe("COMPLETED");
    expect(view.checks.map((check) => check.state)).toEqual(["PASSED", "PASSED"]);
    expect(view.files.created).toEqual(["prisma/schema.prisma"]);
    expect(view.failures.some((failure) => failure.id === "generate-old")).toBe(false);
    expect(view.log.some((entry) => entry.text.includes("npx prisma generate failed"))).toBe(true);
    expect(snapshotCodingRun(codingRunFromWorkspace({
      status: "READY_FOR_REVIEW",
      plan: { status: "COMPLETED", steps: [], version: 4, approvedAt: "2026-10-14T13:12:17.272Z" },
      escalations: [],
      evidence: [
        { result: "FAIL", command: "npx prisma generate" },
        { result: "PASS", command: "npx prisma validate" },
        { result: "PASS", command: "npm run build" },
      ],
      agentRun: { status: "FAILED", input: { phase: "implement", planVersion: 4 }, startedAt: "2026-10-14T13:12:00.000Z" },
    }))).toBe("COMPLETED");
  });

  it("treats a failed workspace as FAILED and a reviewed workspace as COMPLETED", () => {
    expect(classifyCodingRun(input({ workspaceStatus: "FAILED", agentPhase: "implement", agentRunStatus: "FAILED" }))).toBe("FAILED");
    expect(classifyCodingRun(input({
      workspaceStatus: "READY_FOR_REVIEW",
      planStatus: "COMPLETED",
      agentPhase: "implement",
      agentRunStatus: "COMPLETED",
      evidence: [{ id: "build-2", description: "npm run build", command: "npm run build", result: "PASS", exitCode: 0, at: "2026-10-13T13:00:00.000Z" }],
      events: [{ at: "2026-10-13T13:00:00.000Z", action: "CREATE_FILE", allowed: true, path: "package.json", command: "", reason: "" }],
    }))).toBe("COMPLETED");
  });
});

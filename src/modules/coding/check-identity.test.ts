import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { ChecksAndEvidence } from "@/components/build/coding-panel";
import {
  approvedPlanWindows,
  codingChecksReadyForVerification,
  codeReviewGuidance,
  evaluatePlanChecks,
  type CheckEvidenceInput,
  type PlanVersionWindow,
} from "@/modules/coding/check-identity";

const v4Start = new Date("2026-10-14T13:12:17.272Z");
const earlier = new Date("2026-10-13T15:00:00.000Z");
const duringV4 = new Date("2026-10-14T17:13:42.000Z");
const later = new Date("2026-10-14T17:13:59.000Z");

const windows: PlanVersionWindow[] = [
  { version: 2, startedAt: new Date("2026-10-13T15:37:48.365Z"), endedAt: v4Start },
  { version: 4, startedAt: v4Start, endedAt: null },
];

const v4Checks = [
  { command: "npx prisma validate", applicability: "REQUIRED", label: "Prisma schema validation" },
  { command: "npm run build", applicability: "REQUIRED", label: "Production build" },
  { command: "npm test", applicability: "NOT_APPLICABLE", label: "Unit tests" },
];

function evidence(patch: Partial<CheckEvidenceInput> & Pick<CheckEvidenceInput, "command" | "result">): CheckEvidenceInput {
  return {
    description: "",
    exitCode: patch.result === "PASS" ? 0 : patch.result === "FAIL" ? 1 : null,
    at: duringV4,
    planVersion: null,
    ...patch,
  };
}

describe("plan check identity", () => {
  it("accepts prisma validation by check identity when the command is npx prisma validate", () => {
    const decision = evaluatePlanChecks({
      planVersion: 4,
      windows,
      checks: [{ command: "npx prisma validate", applicability: "REQUIRED" }],
      evidence: [evidence({ command: "npx prisma validate", result: "PASS", description: "Prisma schema validation" })],
    });
    expect(decision.ready).toBe(true);
    expect(decision.required[0]).toMatchObject({ checkId: "PRISMA_VALIDATE", passed: true });
  });

  it("does not let a display label satisfy a different check", () => {
    const decision = evaluatePlanChecks({
      planVersion: 4,
      windows,
      checks: [{ command: "npx prisma validate", applicability: "REQUIRED", label: "prisma validate" }],
      evidence: [evidence({ command: "npm run build", result: "PASS", description: "prisma validate" })],
    });
    expect(decision.required[0].checkId).toBe("PRISMA_VALIDATE");
    expect(decision.required[0].label).toBe("prisma validate");
    expect(decision.ready).toBe(false);
  });

  it("does not require a pass for a check the approved plan marks not applicable", () => {
    const decision = evaluatePlanChecks({
      planVersion: 4,
      windows,
      checks: v4Checks,
      evidence: [
        evidence({ command: "npx prisma validate", result: "PASS" }),
        evidence({ command: "npm run build", result: "PASS", at: later }),
      ],
    });
    expect(decision.notApplicable[0]).toMatchObject({ checkId: "UNIT_TEST", result: "NOT APPLICABLE", passed: false });
    expect(decision.ready).toBe(true);
  });

  it("ignores a historical unit-test failure when the current plan marks unit tests not applicable", () => {
    const decision = evaluatePlanChecks({
      planVersion: 4,
      windows,
      checks: v4Checks,
      evidence: [
        evidence({ command: "npm test", result: "FAIL", description: "unit tests execution", at: duringV4 }),
        evidence({ command: "npx prisma validate", result: "PASS" }),
        evidence({ command: "npm run build", result: "PASS", at: later }),
      ],
    });
    expect(decision.ready).toBe(true);
  });

  it("uses the later prisma pass from the same plan version", () => {
    const decision = evaluatePlanChecks({
      planVersion: 4,
      windows,
      checks: [{ command: "npx prisma validate", applicability: "REQUIRED" }],
      evidence: [
        evidence({ command: "npx prisma validate", result: "FAIL", at: new Date("2026-10-14T13:20:00.000Z") }),
        evidence({ command: "npx prisma validate", result: "PASS", at: later }),
      ],
    });
    expect(decision.required[0]).toMatchObject({ result: "PASS", passed: true });
    expect(decision.ready).toBe(true);
  });

  it("is ready when build and prisma validation passed and unit tests are not applicable", () => {
    const decision = evaluatePlanChecks({
      planVersion: 4,
      windows,
      checks: v4Checks,
      evidence: [
        evidence({ command: "npx prisma validate", result: "FAIL", at: earlier, planVersion: 2 }),
        evidence({ command: "npm test", result: "FAIL", description: "unit tests execution", at: earlier }),
        evidence({ command: "npx prisma validate", result: "PASS" }),
        evidence({ command: "npm run build", result: "PASS", at: later }),
      ],
    });
    expect(decision.ready).toBe(true);
    expect(decision.required.map((check) => check.checkId)).toEqual(["PRISMA_VALIDATE", "BUILD"]);
  });

  it("blocks a required check that failed in the current plan", () => {
    const decision = evaluatePlanChecks({
      planVersion: 4,
      windows,
      checks: v4Checks,
      evidence: [
        evidence({ command: "npx prisma validate", result: "PASS" }),
        evidence({ command: "npm run build", result: "FAIL", at: later }),
      ],
    });
    expect(decision.ready).toBe(false);
    expect(decision.required.find((check) => check.checkId === "BUILD")?.result).toBe("FAIL");
  });

  it("blocks a required check with no evidence in the current plan", () => {
    const decision = evaluatePlanChecks({
      planVersion: 4,
      windows,
      checks: [{ command: "npm run build", applicability: "REQUIRED" }],
      evidence: [],
    });
    expect(decision.ready).toBe(false);
    expect(decision.required[0].result).toBe("NOT RUN");
  });

  it("does not let evidence from another plan version satisfy the current plan", () => {
    const decision = evaluatePlanChecks({
      planVersion: 4,
      windows,
      checks: [{ command: "npm run build", applicability: "REQUIRED" }],
      evidence: [evidence({ command: "npm run build", result: "PASS", at: later, planVersion: 3 })],
    });
    expect(decision.ready).toBe(false);
    expect(decision.required[0].result).toBe("NOT RUN");
  });

  it("reuses prior approved-plan evidence after a scope-only revision when acceptPriorEvidence is set", () => {
    const decision = evaluatePlanChecks({
      planVersion: 4,
      windows,
      checks: [{ command: "npm run build", applicability: "REQUIRED" }],
      evidence: [evidence({ command: "npm run build", result: "PASS", at: earlier, planVersion: 2 })],
      acceptPriorEvidence: true,
    });
    expect(decision.ready).toBe(true);
    expect(decision.required[0]).toMatchObject({ result: "PASS", passed: true });
  });

  it("attributes untagged evidence to the approved plan whose window contains it", () => {
    const derived = approvedPlanWindows({
      version: 4,
      status: "COMPLETED",
      approvedAt: v4Start,
      history: [
        { version: 2, status: "APPROVED", approvedAt: "2026-10-13T15:37:48.365Z" },
        { version: 3, status: "PROPOSED", approvedAt: null },
      ],
    });
    const decision = evaluatePlanChecks({
      planVersion: 4,
      windows: derived,
      checks: [{ command: "npm run build", applicability: "REQUIRED" }],
      evidence: [
        evidence({ command: "npm run build", result: "PASS", at: earlier }),
        evidence({ command: "npm run build", result: "PASS", at: later }),
      ],
    });
    expect(decision.ready).toBe(true);
  });
});

describe("verification coding-check eligibility", () => {
  const history = [
    { version: 2, status: "APPROVED", approvedAt: "2026-10-13T15:37:48.365Z" },
    { version: 3, status: "PROPOSED", approvedAt: null },
  ];

  it("allows verification after a scope-only plan revision when earlier required checks passed", () => {
    const decision = codingChecksReadyForVerification({
      planVersion: 4,
      planStatus: "APPROVED",
      planApprovedAt: v4Start,
      planHistory: history,
      checks: v4Checks,
      evidence: [
        evidence({ command: "npx prisma validate", result: "PASS", at: earlier, planVersion: 2 }),
        evidence({ command: "npm run build", result: "PASS", at: earlier, planVersion: 2 }),
        evidence({ command: "npm test", result: "FAIL", at: earlier, planVersion: 2 }),
      ],
    });
    expect(decision.ready).toBe(true);
    expect(decision.required.every((check) => check.passed)).toBe(true);
  });

  it("keeps historical failures recorded but uses the latest recovery pass", () => {
    const decision = codingChecksReadyForVerification({
      planVersion: 4,
      planStatus: "APPROVED",
      planApprovedAt: v4Start,
      planHistory: history,
      checks: v4Checks,
      evidence: [
        evidence({ command: "npx prisma validate", result: "FAIL", at: earlier, planVersion: 2 }),
        evidence({ command: "npm run build", result: "FAIL", at: earlier, planVersion: 2 }),
        evidence({ command: "npx prisma validate", result: "PASS", at: duringV4, planVersion: 2 }),
        evidence({ command: "npm run build", result: "PASS", at: later, planVersion: 2 }),
      ],
    });
    expect(decision.ready).toBe(true);
  });

  it("still blocks verification when the latest evidence failed", () => {
    const decision = codingChecksReadyForVerification({
      planVersion: 4,
      planStatus: "APPROVED",
      planApprovedAt: v4Start,
      planHistory: history,
      checks: v4Checks,
      evidence: [
        evidence({ command: "npx prisma validate", result: "PASS", at: earlier, planVersion: 2 }),
        evidence({ command: "npm run build", result: "PASS", at: earlier, planVersion: 2 }),
        evidence({ command: "npm run build", result: "FAIL", at: later, planVersion: 2 }),
      ],
    });
    expect(decision.ready).toBe(false);
    expect(decision.required.find((check) => check.checkId === "BUILD")?.result).toBe("FAIL");
  });

  it("blocks verification when a newly required check has no evidence", () => {
    const decision = codingChecksReadyForVerification({
      planVersion: 4,
      planStatus: "APPROVED",
      planApprovedAt: v4Start,
      planHistory: history,
      checks: [
        ...v4Checks,
        { command: "npm run typecheck", applicability: "REQUIRED", label: "Typecheck" },
      ],
      evidence: [
        evidence({ command: "npx prisma validate", result: "PASS", at: earlier, planVersion: 2 }),
        evidence({ command: "npm run build", result: "PASS", at: earlier, planVersion: 2 }),
      ],
    });
    expect(decision.ready).toBe(false);
    expect(decision.required.find((check) => check.checkId === "TYPECHECK")?.result).toBe("NOT RUN");
  });

  it("blocks verification when required checks never passed", () => {
    const decision = codingChecksReadyForVerification({
      planVersion: 4,
      planStatus: "COMPLETED",
      planApprovedAt: v4Start,
      planHistory: history,
      checks: v4Checks,
      evidence: [],
    });
    expect(decision.ready).toBe(false);
  });

  it("ignores stale validation evidence recorded outside any approved plan window", () => {
    const decision = codingChecksReadyForVerification({
      planVersion: 4,
      planStatus: "APPROVED",
      planApprovedAt: v4Start,
      planHistory: history,
      checks: v4Checks,
      evidence: [
        evidence({
          command: "npx prisma validate",
          result: "PASS",
          at: new Date("2026-10-01T12:00:00.000Z"),
        }),
        evidence({
          command: "npm run build",
          result: "PASS",
          at: new Date("2026-10-01T12:01:00.000Z"),
        }),
      ],
    });
    expect(decision.ready).toBe(false);
    expect(decision.required.every((check) => check.result === "NOT RUN")).toBe(true);
  });

  it("remains eligible after an already-committed approved snapshot when prior checks passed", () => {
    const decision = codingChecksReadyForVerification({
      planVersion: 4,
      planStatus: "APPROVED",
      planApprovedAt: v4Start,
      planHistory: history,
      checks: v4Checks,
      evidence: [
        evidence({ command: "npx prisma validate", result: "PASS", at: earlier, planVersion: 2 }),
        evidence({ command: "npm run build", result: "PASS", at: earlier, planVersion: 2 }),
      ],
    });
    expect(decision.ready).toBe(true);
    expect(codeReviewGuidance({
      status: "COMPLETED",
      headCommit: "7badef42504c88ec8d27de47d8f2f804ae757bee",
      baseCommit: "a201aaf20a5bdfd6224899e01f21f6517d98446f",
    })).toBe("Approved source snapshot committed. Ready for Independent Verification.");
  });
});

describe("post-commit review guidance", () => {
  it("shows independent verification after the approved commit and keeps the audit history", () => {
    expect(codeReviewGuidance({
      status: "COMPLETED",
      headCommit: "9abadcbfb2509ffad5902628e1d5bfcd5a8d7075",
      baseCommit: "ad31f96537d67da73d406a77832ae8a94216da7b",
    })).toBe("Approved source snapshot committed. Ready for Independent Verification.");
    expect(codeReviewGuidance({ status: "READY_FOR_REVIEW", commitOffer: true })).toContain("Create a local commit");
    const html = renderToStaticMarkup(createElement(ChecksAndEvidence, {
      workspace: {
        status: "COMPLETED",
        headCommit: "9abadcbfb2509ffad5902628e1d5bfcd5a8d7075",
        baseCommit: "ad31f96537d67da73d406a77832ae8a94216da7b",
        plan: {
          version: 4,
          status: "COMPLETED",
          approvedAt: v4Start,
          history: [{ version: 2, status: "APPROVED", approvedAt: "2026-10-13T15:37:48.365Z" }],
          setupCommands: ["npm install", "npx prisma generate"],
          validationCommands: v4Checks.map((check) => ({ ...check, kind: "VALIDATION", reason: "" })),
        },
        evidence: [
          { id: "old-test", type: "TEST_RESULT", source: "COMMAND_RUNNER", result: "FAIL", command: "npm test", description: "unit tests execution", exitCode: 1, createdAt: earlier, completedAt: earlier },
          { id: "validate", type: "TEST_RESULT", source: "COMMAND_RUNNER", result: "PASS", command: "npx prisma validate", description: "npx prisma validate", exitCode: 0, createdAt: duringV4, completedAt: duringV4 },
          { id: "build", type: "BUILD", source: "COMMAND_RUNNER", result: "PASS", command: "npm run build", description: "npm run build", exitCode: 0, createdAt: later, completedAt: later },
          { id: "install", type: "TEST_RESULT", source: "COMMAND_RUNNER", result: "PASS", command: "npm install", description: "npm install", exitCode: 0, createdAt: duringV4, completedAt: duringV4 },
          { id: "generate", type: "TEST_RESULT", source: "COMMAND_RUNNER", result: "PASS", command: "npx prisma generate", description: "npx prisma generate", exitCode: 0, createdAt: duringV4, completedAt: duringV4 },
          { id: "commit", type: "HUMAN_CONFIRMATION", source: "HUMAN", result: "COMMITTED", command: "", description: "Local commit", exitCode: null, createdAt: later, completedAt: null },
        ],
        approvals: [{ stale: false, headCommit: "9abadcbfb2509ffad5902628e1d5bfcd5a8d7075" }],
      },
    }));
    expect(html).toContain("Current result");
    expect(html).toContain("Prisma schema validation");
    expect(html).toContain("Production build");
    expect(html).toContain("Unit tests");
    expect(html).toContain("Approved snapshot committed");
    expect(html).toContain("View full audit history");
    expect(html).toContain("unit tests execution");
    expect(html).toContain("FAIL");
    expect(html).not.toContain("Create a local commit");
  });
});

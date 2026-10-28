import { describe, expect, it } from "vitest";

import { hashText } from "@/modules/coding/policy";
import {
  CHECKS_BLOCK_APPROVAL,
  CHECKS_STALE,
  classifyPlanDiff,
  codeApprovalDecision,
  DIFF_UNAVAILABLE,
  effectiveCommandResults,
  executionPlanScopeRevision,
  isGeneratedReviewPath,
  OUT_OF_SCOPE_BLOCK,
  validationSnapshotDrifted,
} from "@/modules/coding/review";

const evidence = [
  { command: "npm install", result: "PASS", exitCode: 0, at: "2026-10-14T13:12:36.000Z" },
  { command: "npx prisma generate", result: "FAIL", exitCode: 1, at: "2026-10-14T13:12:38.000Z" },
  { command: "npx prisma validate", result: "NOT RUN", exitCode: null, at: "2026-10-14T13:12:38.000Z" },
  { command: "npm run build", result: "NOT RUN", exitCode: null, at: "2026-10-14T13:12:38.000Z" },
  { command: "npx prisma generate", result: "PASS", exitCode: 0, at: "2026-10-14T17:13:41.000Z" },
  { command: "npx prisma validate", result: "PASS", exitCode: 0, at: "2026-10-14T17:13:42.000Z" },
  { command: "npm run build", result: "PASS", exitCode: 0, at: "2026-10-14T17:13:59.000Z" },
];

const plan = {
  setupCommands: ["npm install", "npx prisma generate"],
  validationCommands: [
    { command: "npx prisma validate", applicability: "REQUIRED" },
    { command: "npm run build", applicability: "REQUIRED" },
    { command: "npm test", applicability: "NOT_APPLICABLE" },
  ],
};

describe("effective coding review", () => {
  it("uses the later repair result when the original run failed", () => {
    const review = effectiveCommandResults({ ...plan, evidence });
    expect(review.setup.map((item) => [item.command, item.passed])).toEqual([
      ["npm install", true],
      ["npx prisma generate", true],
    ]);
    expect(review.required.map((item) => [item.command, item.passed])).toEqual([
      ["npx prisma validate", true],
      ["npm run build", true],
    ]);
    expect(review.notApplicable).toEqual(["npm test"]);
    expect(review.passed).toBe(true);
    expect(codeApprovalDecision({ sourceFileCount: 6, checksPassed: review.passed, checksStale: false }).approvable).toBe(true);
  });

  it("blocks approval when the latest required check failed", () => {
    const review = effectiveCommandResults({
      ...plan,
      evidence: [...evidence, { command: "npm run build", result: "FAIL", exitCode: 1, at: "2026-10-14T18:00:00.000Z" }],
    });
    expect(review.passed).toBe(false);
    expect(codeApprovalDecision({ sourceFileCount: 2, checksPassed: false, checksStale: false })).toEqual({
      approvable: false,
      reason: CHECKS_BLOCK_APPROVAL,
    });
    expect(CHECKS_BLOCK_APPROVAL).not.toMatch(/Coding Agent/);
  });

  it("blocks approval when source changes after the checks", () => {
    const review = effectiveCommandResults({
      ...plan,
      evidence,
      sourceChangedAt: new Date("2026-10-14T18:00:00.000Z"),
    });
    expect(review.stale).toBe(true);
    expect(review.passed).toBe(false);
    expect(codeApprovalDecision({ sourceFileCount: 2, checksPassed: false, checksStale: true }).reason).toBe(CHECKS_STALE);
  });

  it("does not offer approval for an empty source diff", () => {
    expect(codeApprovalDecision({ sourceFileCount: 0, checksPassed: true, checksStale: false })).toEqual({
      approvable: false,
      reason: DIFF_UNAVAILABLE,
    });
  });

  it("blocks approval when the coding baseline cannot be resolved", () => {
    expect(codeApprovalDecision({
      sourceFileCount: 0,
      checksPassed: true,
      checksStale: false,
      baselineUnresolved: true,
    }).reason).toMatch(/baseline commit/i);
  });

  it("detects drift when HEAD moves or the worktree becomes dirty after a committed validation", () => {
    const base = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const head = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const next = "cccccccccccccccccccccccccccccccccccccccc";
    expect(validationSnapshotDrifted({
      recordedHeadCommit: base,
      currentHeadCommit: base,
      baseCommit: base,
      workingTreeDirty: true,
    })).toBe(false);
    expect(validationSnapshotDrifted({
      recordedHeadCommit: head,
      currentHeadCommit: head,
      baseCommit: base,
      workingTreeDirty: false,
    })).toBe(false);
    expect(validationSnapshotDrifted({
      recordedHeadCommit: head,
      currentHeadCommit: next,
      baseCommit: base,
      workingTreeDirty: false,
    })).toBe(true);
    expect(validationSnapshotDrifted({
      recordedHeadCommit: head,
      currentHeadCommit: head,
      baseCommit: base,
      workingTreeDirty: true,
    })).toBe(true);
  });

  it("classifies approved, derived, generated, and out-of-scope changes", () => {
    const files = classifyPlanDiff({
      files: [
        { path: "src/app/page.tsx", status: "added" },
        { path: "src/lib/db.ts", status: "modified" },
        { path: "src/old.ts", status: "deleted" },
        { path: "package-lock.json", status: "added" },
        { path: ".gitignore", status: "modified" },
        { path: ".next/cache.js", status: "added" },
        { path: "notes.txt", status: "added" },
        { path: "src/auth/security.ts", status: "modified" },
        { path: "README.md", status: "deleted" },
      ],
      approvedFiles: ["src/app/page.tsx", "src/lib/db.ts", "src/old.ts"],
      setupCommands: ["npm install"],
      steps: ["Create src/app/page.tsx.", "Delete src/old.ts."],
    });
    expect(files.map((file) => [file.path, file.classification])).toEqual([
      ["src/app/page.tsx", "APPROVED"],
      ["src/lib/db.ts", "APPROVED"],
      ["src/old.ts", "APPROVED"],
      ["package-lock.json", "DERIVED"],
      [".gitignore", "DERIVED"],
      [".next/cache.js", "GENERATED_IGNORED"],
      ["notes.txt", "OUT_OF_SCOPE"],
      ["src/auth/security.ts", "OUT_OF_SCOPE"],
      ["README.md", "OUT_OF_SCOPE"],
    ]);
    expect(codeApprovalDecision({
      sourceFileCount: 7,
      checksPassed: true,
      checksStale: false,
      outOfScope: files.filter((file) => file.classification === "OUT_OF_SCOPE"),
      planAuthorised: true,
    })).toEqual({ approvable: false, reason: OUT_OF_SCOPE_BLOCK });
  });

  it("does not treat a root document change as stale validation", () => {
    const review = effectiveCommandResults({
      ...plan,
      evidence,
      sourceFiles: [{ path: "README.md", changedAt: new Date("2026-10-15T12:00:00.000Z") }],
    });
    expect(review.stale).toBe(false);
    expect(review.passed).toBe(true);
    const schema = effectiveCommandResults({
      ...plan,
      evidence,
      sourceFiles: [{ path: "prisma/schema.prisma", changedAt: new Date("2026-10-15T12:00:00.000Z") }],
    });
    expect(schema.stale).toBe(true);
    expect(schema.required.every((item) => item.passed)).toBe(false);
  });

  it("proposes a new plan version without editing the approved file list", () => {
    const approved = ["src/app/page.tsx"];
    const steps = ["Create src/app/page.tsx."];
    const revision = executionPlanScopeRevision({
      version: 4,
      files: approved,
      steps,
      path: "README.md",
      status: "deleted",
    });
    expect(approved).toEqual(["src/app/page.tsx"]);
    expect(steps).toEqual(["Create src/app/page.tsx."]);
    expect(revision).toMatchObject({
      version: 5,
      status: "PROPOSED",
      approvedAt: null,
      files: ["src/app/page.tsx", "README.md"],
    });
    expect(revision.steps.at(-1)).toBe("Delete README.md.");
  });

  it("adds a modify work item when authorising an existing file change", () => {
    const approved = [
      "src/app/api/discovery/feed/route.ts",
      "src/app/api/discovery/action/route.ts",
      "src/app/discovery/page.tsx",
    ];
    const steps = approved.map((file) => `Create ${file}.`);
    const revision = executionPlanScopeRevision({
      version: 2,
      files: approved,
      steps,
      path: ".gitignore",
      status: "modified",
    });
    expect(approved).toHaveLength(3);
    expect(steps).toHaveLength(3);
    expect(revision.files).toEqual([...approved, ".gitignore"]);
    expect(revision.steps.slice(0, 3)).toEqual(steps);
    expect(revision.steps.at(-1)).toBe("Modify .gitignore to exclude generated files from version control.");
  });

  it("excludes generated artefacts and keeps a stable snapshot of the source diff", () => {
    expect(isGeneratedReviewPath(".next/server/pages/404.html")).toBe(true);
    expect(isGeneratedReviewPath("node_modules/react/index.js")).toBe(true);
    expect(isGeneratedReviewPath("next-env.d.ts")).toBe(true);
    expect(isGeneratedReviewPath("src/generated/prisma/client.ts")).toBe(true);
    expect(isGeneratedReviewPath("prisma/schema.prisma")).toBe(false);
    expect(isGeneratedReviewPath("src/app/page.tsx")).toBe(false);
    const snapshot = hashText("model User {}\n");
    expect(hashText("model User {}\n")).toBe(snapshot);
    expect(hashText("model Profile {}\n")).not.toBe(snapshot);
  });
});

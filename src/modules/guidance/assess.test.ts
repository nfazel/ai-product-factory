import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { assessGuidance, emptySnapshot } from "@/modules/guidance/assess";
import type { GuidanceSnapshot, TaskSnapshot } from "@/modules/guidance/types";

function snap(patch: Partial<GuidanceSnapshot> = {}): GuidanceSnapshot {
  return emptySnapshot({ productId: "p1", name: "Northwind", ...patch });
}

function task(patch: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    id: "t1",
    title: "Submit a claim",
    status: "PROPOSED",
    humanOnly: false,
    prohibited: false,
    contractStale: false,
    codeApproval: "NONE",
    workspace: "NONE",
    published: false,
    pullRequest: "NONE",
    verification: "NONE",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...patch,
  };
}

const briefApproved: GuidanceSnapshot["discovery"] = {
  started: true,
  briefStatus: "APPROVED",
  readyForReview: true,
  openQuestions: 0,
  demo: false,
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const defined: GuidanceSnapshot["definition"] = {
  exists: true,
  status: "APPROVED",
  approved: true,
  proposalOpen: false,
  proposedOutcomes: 0,
  proposedCapabilities: 0,
  slice: "APPROVED",
  openQuestions: 0,
  demo: false,
  updatedAt: null,
  outcome: {
    title: "Claims submitted digitally",
    status: "NOT_STARTED",
    measure: "Share of claims started online",
    target: "40%",
    latest: "",
    latestDemo: false,
  },
};

const designed: GuidanceSnapshot["design"] = {
  architecture: "APPROVED",
  architectureReview: false,
  architectureReviewReason: "",
  plan: "APPROVED",
  planReview: false,
  planReviewReason: "",
  demo: false,
  updatedAt: null,
  traceabilityIssue: "",
};

const reviewed: GuidanceSnapshot["review"] = {
  exists: true,
  approved: true,
  reviewRequired: false,
  reviewReason: "",
  openCritical: 0,
  openHighBeforeCoding: 0,
  openFindings: 0,
  policyApproved: true,
  policyReapproval: false,
  policyReason: "",
  demo: false,
  updatedAt: null,
};

function pastDefine(patch: Partial<GuidanceSnapshot> = {}) {
  return snap({
    stage: "BUILD",
    discovery: briefApproved,
    definition: defined,
    developmentContext: "GREENFIELD",
    ...patch,
  });
}

describe("next action", () => {
  it("starts discovery for a new product", () => {
    const guidance = assessGuidance(snap());
    expect(guidance.action?.key).toBe("start-discovery");
    expect(guidance.action?.label).toBe("Start Discovery");
    expect(guidance.blocker).toBeNull();
  });

  it("asks for open questions while discovery is incomplete", () => {
    const guidance = assessGuidance(snap({
      discovery: { ...briefApproved, briefStatus: "DRAFT", readyForReview: false, openQuestions: 2 },
    }));
    expect(guidance.action?.label).toBe("Answer 2 open questions");
  });

  it("asks a person to review a draft brief", () => {
    const guidance = assessGuidance(snap({
      discovery: { ...briefApproved, briefStatus: "DRAFT", readyForReview: false, openQuestions: 0 },
    }));
    expect(guidance.action?.label).toBe("Review Product Brief");
  });

  it("asks for brief approval when the brief is ready", () => {
    const guidance = assessGuidance(snap({
      discovery: { ...briefApproved, briefStatus: "READY_FOR_REVIEW" },
    }));
    expect(guidance.action?.label).toBe("Approve Product Brief");
    expect(guidance.action?.decision).toBe(true);
  });

  it("offers Move to Define only after the brief is approved", () => {
    const guidance = assessGuidance(snap({ discovery: briefApproved }));
    expect(guidance.action?.key).toBe("move-define");
    expect(guidance.action?.decision).toBe(false);
  });

  it("asks to draft a definition when Define has not started", () => {
    const guidance = assessGuidance(snap({ stage: "DEFINE", discovery: briefApproved }));
    expect(guidance.action?.label).toBe("Draft the Product Definition");
  });

  it("asks to confirm the first slice when it is still a proposal", () => {
    const guidance = assessGuidance(snap({
      stage: "DEFINE",
      discovery: briefApproved,
      definition: { ...defined, status: "IN_PROGRESS", approved: false, slice: "PROPOSED" },
    }));
    expect(guidance.action?.key).toBe("confirm-slice");
    expect(guidance.action?.href).toBe("/products/p1/definition#slice");
  });

  it("sends an open definition proposal to the draft review", () => {
    const guidance = assessGuidance(snap({
      stage: "DEFINE",
      discovery: briefApproved,
      definition: {
        ...defined,
        exists: true,
        status: "IN_PROGRESS",
        approved: false,
        proposalOpen: true,
        slice: "NONE",
      },
    }));
    expect(guidance.action?.key).toBe("review-definition");
    expect(guidance.action?.label).toBe("Review the draft definition");
    expect(guidance.action?.href).toBe("/products/p1/definition#proposal");
    expect(guidance.action?.decision).toBe(true);
  });

  it("asks to draft again when the definition has no First Slice to confirm", () => {
    const guidance = assessGuidance(snap({
      stage: "DEFINE",
      discovery: briefApproved,
      definition: { ...defined, exists: true, status: "IN_PROGRESS", approved: false, slice: "NONE" },
    }));
    expect(guidance.action?.key).toBe("draft-definition");
    expect(guidance.action?.href).toBe("/products/p1/definition");
  });

  it("asks to answer definition questions before approval", () => {
    const guidance = assessGuidance(snap({
      stage: "DEFINE",
      discovery: briefApproved,
      definition: {
        ...defined,
        exists: true,
        status: "READY_FOR_REVIEW",
        approved: false,
        slice: "APPROVED",
        openQuestions: 2,
      },
    }));
    expect(guidance.action?.key).toBe("answer-definition-questions");
    expect(guidance.action?.href).toBe("/products/p1/definition#questions");
    expect(guidance.action?.why).toMatch(/does not approve/);
  });

  it("prepares the definition before offering approval", () => {
    const preparing = assessGuidance(snap({
      stage: "DEFINE",
      discovery: briefApproved,
      definition: { ...defined, exists: true, status: "IN_PROGRESS", approved: false, slice: "APPROVED" },
    }));
    expect(preparing.action?.key).toBe("prepare-definition");
    expect(preparing.action?.href).toBe("/products/p1/definition#approve");
    const approving = assessGuidance(snap({
      stage: "DEFINE",
      discovery: briefApproved,
      definition: { ...defined, exists: true, status: "READY_FOR_REVIEW", approved: false, slice: "APPROVED" },
    }));
    expect(approving.action?.key).toBe("approve-definition");
    expect(approving.action?.href).toBe("/products/p1/definition#approve");
    expect(approving.action?.why).toMatch(/does not move the stage/);
    expect(approving.action?.key).not.toBe("move-build");
  });

  it("offers Move to Build when the definition and slice are approved", () => {
    const guidance = assessGuidance(snap({
      stage: "DEFINE",
      discovery: briefApproved,
      definition: defined,
    }));
    expect(guidance.action?.key).toBe("move-build");
  });

  it("asks what is being built before design when that choice is missing", () => {
    const guidance = assessGuidance(pastDefine({ developmentContext: "UNSET" }));
    expect(guidance.action?.key).toBe("choose-development-context");
    expect(guidance.action?.href).toBe("/products/p1/build#context");
  });

  it("lets a greenfield product continue without codebase context", () => {
    const guidance = assessGuidance(pastDefine({ developmentContext: "GREENFIELD", codebaseCaptured: false }));
    expect(guidance.action?.key).toBe("review-design");
    expect(guidance.action?.href).toBe("/products/p1/build#design");
    expect(guidance.action?.why).toMatch(/does not approve/);
    expect(guidance.action?.key).not.toBe("add-codebase-context");
    expect(guidance.action?.key).not.toBe("approve-design");
  });

  it("asks an existing application for codebase context", () => {
    const missing = assessGuidance(pastDefine({ developmentContext: "EXISTING_SYSTEM", codebaseCaptured: false }));
    expect(missing.action?.key).toBe("add-codebase-context");
    expect(missing.action?.href).toBe("/products/p1/build#context");
    const ready = assessGuidance(pastDefine({ developmentContext: "EXISTING_SYSTEM", codebaseCaptured: true }));
    expect(ready.action?.key).toBe("review-design");
  });

  it("prepares a committed draft before offering design approval", () => {
    const draft = assessGuidance(pastDefine({
      design: { ...designed, architecture: "DRAFT", plan: "NONE" },
    }));
    expect(draft.action?.key).toBe("prepare-design");
    expect(draft.action?.href).toBe("/products/p1/build#design");
    expect(draft.action?.why).toMatch(/does not approve/);
    const ready = assessGuidance(pastDefine({
      design: { ...designed, architecture: "READY", plan: "NONE" },
    }));
    expect(ready.action?.key).toBe("approve-design");
    expect(ready.action?.label).toBe("Approve Design");
    expect(ready.action?.href).toBe("/products/p1/build#design");
    expect(ready.action?.why).toMatch(/does not move the product to Prove/);
  });

  it("moves from an approved design to the delivery plan without leaving Build", () => {
    const guidance = assessGuidance(pastDefine({
      design: { ...designed, architecture: "APPROVED", plan: "NONE" },
    }));
    expect(guidance.action?.key).toBe("review-plan");
    expect(guidance.action?.href).toBe("/products/p1/build#plan");
    expect(guidance.stage).toBe("BUILD");
  });

  it("offers Move to Prove only as a human action after the slice is verified", () => {
    const waiting = assessGuidance(pastDefine({
      design: designed,
      review: reviewed,
      tasks: [task({ status: "COMPLETED", codeApproval: "CURRENT", verification: "APPROVED", published: true, pullRequest: "MERGED" })],
      prove: { sliceVerified: false, integrated: false, entryOpen: true, entryReason: "" },
    }));
    expect(waiting.action?.key).not.toBe("move-prove");
    const ready = assessGuidance(pastDefine({
      design: designed,
      review: reviewed,
      tasks: [task({ status: "COMPLETED", codeApproval: "CURRENT", verification: "APPROVED", published: true, pullRequest: "MERGED" })],
      prove: { sliceVerified: true, integrated: true, entryOpen: true, entryReason: "" },
    }));
    expect(ready.action?.key).toBe("move-prove");
    expect(ready.action?.label).toBe("Move to Prove");
    expect(ready.stage).toBe("BUILD");
  });

  it("maps every Build next action to a control that exists on the page", () => {
    const buildPage = readFileSync(resolve("src/app/(app)/products/[id]/build/page.tsx"), "utf8");
    const controls = readFileSync(resolve("src/components/build/controls.tsx"), "utf8");
    const governance = readFileSync(resolve("src/components/build/governance-panel.tsx"), "utf8");
    const testing = readFileSync(resolve("src/app/(app)/products/[id]/testing/page.tsx"), "utf8");
    const guidanceUi = readFileSync(resolve("src/components/guidance/guidance-ui.tsx"), "utf8");
    const surfaces = `${buildPage}\n${controls}\n${governance}\n${testing}`;
    const cases: Array<[Partial<GuidanceSnapshot>, string, string]> = [
      [{ developmentContext: "UNSET" }, "choose-development-context", "#context"],
      [{ developmentContext: "EXISTING_SYSTEM", codebaseCaptured: false }, "add-codebase-context", "#context"],
      [{ developmentContext: "GREENFIELD", codebaseCaptured: false }, "review-design", "#design"],
      [{ design: { ...designed, architecture: "DRAFT", plan: "NONE" } }, "prepare-design", "#design"],
      [{ design: { ...designed, architecture: "READY", plan: "NONE" } }, "approve-design", "#design"],
      [{ design: { ...designed, architecture: "APPROVED", plan: "NONE" } }, "review-plan", "#plan"],
      [{ design: { ...designed, architecture: "APPROVED", plan: "DRAFT" } }, "prepare-plan", "#plan"],
      [{ design: { ...designed, architecture: "APPROVED", plan: "READY" } }, "approve-plan", "#plan"],
      [{ design: designed, review: { ...reviewed, approved: false, reviewRequired: true } }, "resolve-finding", "#review"],
      [{ design: designed, review: { ...reviewed, approved: false } }, "approve-review", "#review"],
      [{ design: designed, review: { ...reviewed, policyApproved: false } }, "approve-rules", "#review"],
      [{ design: designed, review: reviewed, tasks: [task()] }, "approve-task", "#code"],
      [{ design: designed, review: reviewed, tasks: [task({ status: "APPROVED" })] }, "start-coding", "#code"],
      [{ design: designed, review: reviewed, tasks: [task({ status: "IN_PROGRESS", workspace: "OPEN" })] }, "review-change", "#code"],
      [{ design: designed, review: reviewed, tasks: [task({ status: "IN_PROGRESS", workspace: "OPEN", codeApproval: "CURRENT" })] }, "approve-change", "#code"],
      [{ design: designed, review: reviewed, tasks: [task({ status: "COMPLETED", codeApproval: "CURRENT" })] }, "start-check", "#check"],
      [{ design: designed, review: reviewed, tasks: [task({ status: "COMPLETED", codeApproval: "CURRENT", verification: "AWAITING" })] }, "approve-verification", "#check"],
      [{ design: designed, review: reviewed, tasks: [task({ status: "COMPLETED", codeApproval: "CURRENT", verification: "APPROVED" })] }, "publish-branch", "#publish"],
      [{ design: designed, review: reviewed, tasks: [task({ status: "COMPLETED", codeApproval: "CURRENT", verification: "APPROVED", published: true })] }, "create-pr", "#publish"],
      [{ design: designed, review: reviewed, tasks: [task({ status: "COMPLETED", codeApproval: "CURRENT", verification: "APPROVED", published: true, pullRequest: "OPEN" })] }, "refresh-pr", "#publish"],
    ];
    for (const [patch, key, hash] of cases) {
      const guidance = assessGuidance(pastDefine(patch));
      expect(guidance.action?.key, key).toBe(key);
      expect(guidance.action?.href, key).toContain(hash);
      expect(surfaces, `${key} ${hash}`).toContain(`id="${hash.slice(1)}"`);
    }
    expect(guidanceUi).toContain('"move-prove": "PROVE"');
    const stale = assessGuidance(pastDefine({
      design: { ...designed, traceabilityIssue: "Governance review cannot complete because Design item NFR-001 references an NFR that is no longer part of the current approved definition." },
    }));
    expect(stale.action?.key).toBe("repair-traceability");
    expect(stale.action?.href).toBe("/products/p1/build#design");
    expect(stale.action?.why).toMatch(/NFR-001/);
    expect(buildPage).toContain("Design has not been generated yet.");
    expect(buildPage).toContain("Approve Design");
    expect(buildPage).toContain("A delivery plan has not been generated yet.");
  });

  it("blocks on an engineering finding instead of offering coding", () => {
    const guidance = assessGuidance(pastDefine({
      design: designed,
      review: { ...reviewed, approved: false, reviewRequired: true, reviewReason: "A high finding is open." },
    }));
    expect(guidance.action?.label).toBe("Resolve Engineering Finding");
    expect(guidance.blocker?.what).toBe("Engineering review needs attention");
    const blocking = assessGuidance(pastDefine({
      design: designed,
      review: { ...reviewed, approved: false, openCritical: 1, openFindings: 2 },
    }));
    expect(blocking.action?.label).toBe("Resolve 1 blocking governance issue");
    expect(blocking.action?.href).toBe("/products/p1/build#review");
    expect(blocking.action?.label).not.toMatch(/complete/i);
    const open = assessGuidance(pastDefine({
      design: designed,
      review: { ...reviewed, approved: false, openFindings: 2 },
    }));
    expect(open.action?.label).toBe("Review 2 open governance findings");
    expect(open.blocker).toBeNull();
  });

  it("asks to approve a proposed coding task", () => {
    const guidance = assessGuidance(pastDefine({
      design: designed,
      review: reviewed,
      tasks: [task()],
    }));
    expect(guidance.action?.label).toBe("Approve Coding Task");
  });

  it("asks a person to review a code change", () => {
    const guidance = assessGuidance(pastDefine({
      design: designed,
      review: reviewed,
      tasks: [task({ status: "IN_PROGRESS", workspace: "OPEN" })],
    }));
    expect(guidance.action?.label).toBe("Review Code Change");
  });

  it("asks a person to approve verification", () => {
    const guidance = assessGuidance(pastDefine({
      design: designed,
      review: reviewed,
      tasks: [task({ status: "COMPLETED", codeApproval: "CURRENT", verification: "AWAITING" })],
    }));
    expect(guidance.action?.label).toBe("Approve Verification");
  });

  it("asks to refresh an open pull request and does not merge it", () => {
    const guidance = assessGuidance(pastDefine({
      stage: "PROVE",
      design: designed,
      review: reviewed,
      tasks: [task({
        status: "COMPLETED",
        codeApproval: "CURRENT",
        verification: "APPROVED",
        published: true,
        pullRequest: "OPEN",
      })],
    }));
    expect(guidance.action?.label).toBe("Refresh Pull Request");
    expect(guidance.action?.why).toMatch(/does not merge/);
  });

  it("blocks a release when the slice is not open for one", () => {
    const guidance = assessGuidance(pastDefine({
      stage: "SHIP",
      design: designed,
      review: reviewed,
      tasks: [task({ status: "COMPLETED", verification: "APPROVED", pullRequest: "MERGED", codeApproval: "CURRENT", published: true })],
      prove: { sliceVerified: false, integrated: false, entryOpen: false, entryReason: "Independent verification is not approved." },
    }));
    expect(guidance.action).toBeNull();
    expect(guidance.blocker?.what).toBe("A release record cannot be opened yet");
  });

  it("asks a person to approve a release that is otherwise ready", () => {
    const guidance = assessGuidance(pastDefine({
      stage: "SHIP",
      design: designed,
      review: reviewed,
      tasks: [task({ status: "COMPLETED", verification: "APPROVED", pullRequest: "MERGED", codeApproval: "CURRENT", published: true })],
      prove: { sliceVerified: true, integrated: true, entryOpen: true, entryReason: "" },
      release: {
        real: {
          version: "1.0.0",
          status: "READY_FOR_APPROVAL",
          approval: "NONE",
          staleReason: "",
          openBlockingRisks: 0,
          planApproved: true,
          deployed: false,
          postChecksReady: false,
          updatedAt: "2026-10-02T00:00:00.000Z",
        },
        demoOnly: false,
        readyToLearn: false,
        learnReason: "Not approved.",
      },
    }));
    expect(guidance.action?.label).toBe("Approve Release");
    expect(guidance.action?.why).toMatch(/does not deploy/);
  });

  it("asks a person to record a deployment after approval", () => {
    const guidance = assessGuidance(pastDefine({
      stage: "SHIP",
      design: designed,
      review: reviewed,
      tasks: [task({ status: "COMPLETED", verification: "APPROVED", pullRequest: "MERGED", codeApproval: "CURRENT", published: true })],
      release: {
        real: {
          version: "1.0.0",
          status: "APPROVED",
          approval: "CURRENT",
          staleReason: "",
          openBlockingRisks: 0,
          planApproved: true,
          deployed: false,
          postChecksReady: false,
          updatedAt: null,
        },
        demoOnly: false,
        readyToLearn: false,
        learnReason: "",
      },
    }));
    expect(guidance.action?.label).toBe("Record Deployment");
  });

  it("asks for outcome evidence after deployment without treating deployment as success", () => {
    const guidance = assessGuidance(pastDefine({
      stage: "LEARN",
      design: designed,
      review: reviewed,
      tasks: [task({ status: "COMPLETED", verification: "APPROVED", pullRequest: "MERGED", codeApproval: "CURRENT", published: true })],
      release: {
        real: {
          version: "1.0.0",
          status: "DEPLOYED",
          approval: "CURRENT",
          staleReason: "",
          openBlockingRisks: 0,
          planApproved: true,
          deployed: true,
          postChecksReady: true,
          updatedAt: null,
        },
        demoOnly: false,
        readyToLearn: true,
        learnReason: "",
      },
    }));
    expect(guidance.action?.label).toBe("Record Outcome Evidence");
    expect(guidance.action?.why).toMatch(/does not mean the outcome was achieved/);
    expect(guidance.outcome?.status).not.toBe("ACHIEVED");
  });
});

describe("progress", () => {
  it("does not mark earlier stages complete from the stage index alone", () => {
    const guidance = assessGuidance(snap({ stage: "LEARN" }));
    expect(guidance.stages.every((stage) => stage.status !== "COMPLETED")).toBe(true);
    expect(guidance.stages.find((stage) => stage.stage === "EXPLORE")?.status).not.toBe("COMPLETED");
  });

  it("marks a stage complete only after its gate and after the product has moved on", () => {
    const guidance = assessGuidance(snap({
      stage: "DEFINE",
      discovery: briefApproved,
    }));
    expect(guidance.stages.find((stage) => stage.stage === "EXPLORE")?.status).toBe("COMPLETED");
    expect(guidance.stages.find((stage) => stage.stage === "DEFINE")?.status).not.toBe("COMPLETED");
  });

  it("marks the current stage blocked when an earlier gate is still the next action", () => {
    const guidance = assessGuidance(snap({
      stage: "DEFINE",
      discovery: { ...briefApproved, briefStatus: "READY_FOR_REVIEW" },
    }));
    expect(guidance.stages.find((stage) => stage.stage === "DEFINE")?.status).toBe("BLOCKED");
    expect(guidance.stages.find((stage) => stage.stage === "EXPLORE")?.status).toBe("WAITING_FOR_YOU");
  });

  it("marks the current stage waiting when a person must decide", () => {
    const guidance = assessGuidance(snap({
      discovery: { ...briefApproved, briefStatus: "READY_FOR_REVIEW" },
    }));
    expect(guidance.stages.find((stage) => stage.stage === "EXPLORE")?.status).toBe("WAITING_FOR_YOU");
  });

  it("marks the current stage ready to move when the gate is satisfied", () => {
    const guidance = assessGuidance(snap({ discovery: briefApproved }));
    expect(guidance.stages.find((stage) => stage.stage === "EXPLORE")?.status).toBe("READY_TO_MOVE");
    expect(guidance.stages.find((stage) => stage.stage === "EXPLORE")?.status).not.toBe("COMPLETED");
  });

  it("marks the current stage blocked when a blocker is present", () => {
    const guidance = assessGuidance(pastDefine({
      design: { ...designed, architectureReview: true, architectureReviewReason: "The design changed." },
    }));
    expect(guidance.stages.find((stage) => stage.stage === "BUILD")?.status).toBe("BLOCKED");
  });
});

describe("blockers", () => {
  it("states what, why, the required action, who acts, and what happens next", () => {
    const guidance = assessGuidance(pastDefine({
      design: designed,
      review: reviewed,
      tasks: [task({ status: "IN_PROGRESS", contractStale: true, workspace: "OPEN" })],
    }));
    const blocker = guidance.blocker;
    expect(blocker?.what).toBe("The approved coding instructions are out of date");
    expect(blocker?.why.length).toBeGreaterThan(0);
    expect(blocker?.required.length).toBeGreaterThan(0);
    expect(blocker?.who).toBe("Engineering decision required");
    expect(blocker?.next.length).toBeGreaterThan(0);
    expect(guidance.action).toBeNull();
  });
});

describe("evidence", () => {
  const settled = task({
    status: "COMPLETED",
    codeApproval: "CURRENT",
    verification: "APPROVED",
    published: true,
    pullRequest: "MERGED",
  });

  function readyRelease(): GuidanceSnapshot["release"] {
    return {
      real: {
        version: "1.0.0",
        status: "APPROVED",
        approval: "CURRENT",
        staleReason: "",
        openBlockingRisks: 0,
        planApproved: true,
        deployed: false,
        postChecksReady: false,
        updatedAt: null,
      },
      demoOnly: false,
      readyToLearn: false,
      learnReason: "",
    };
  }

  it("says why the product is ready from the records", () => {
    const guidance = assessGuidance(pastDefine({
      design: designed,
      review: reviewed,
      tasks: [settled],
      prove: { sliceVerified: true, integrated: true, entryOpen: true, entryReason: "" },
      release: readyRelease(),
    }));
    expect(guidance.evidence.ready).toBe(true);
    expect(guidance.evidence.summary.startsWith("Ready because")).toBe(true);
  });

  it("says why evidence is missing", () => {
    const guidance = assessGuidance(snap());
    expect(guidance.evidence.ready).toBe(false);
    expect(guidance.evidence.summary).toMatch(/Not ready because/);
    expect(guidance.evidence.items[0]?.state).toBe("missing");
  });

  it("treats a changed approval as stale", () => {
    const guidance = assessGuidance(pastDefine({
      design: { ...designed, architectureReview: true },
    }));
    const design = guidance.evidence.items.find((item) => item.label === "Design");
    expect(design?.state).toBe("stale");
    expect(guidance.evidence.summary).toBe("Not ready because Design needs review again.");
  });

  it("does not let sample records satisfy readiness", () => {
    const guidance = assessGuidance(pastDefine({
      definition: { ...defined, demo: true },
      design: { ...designed, demo: true },
      review: { ...reviewed, demo: true },
      tasks: [settled],
      prove: { sliceVerified: true, integrated: true, entryOpen: true, entryReason: "" },
      release: { ...readyRelease(), demoOnly: true, real: null },
    }));
    expect(guidance.evidence.ready).toBe(false);
    expect(guidance.evidence.items.some((item) => item.state === "demo")).toBe(true);
    expect(guidance.evidence.summary).toMatch(/sample data/);
  });

  it("does not change readiness when only the display name changes", () => {
    const base = pastDefine({ design: designed, review: reviewed });
    const renamed = { ...base, name: "A different title" };
    expect(assessGuidance(base).evidence).toEqual(assessGuidance(renamed).evidence);
  });

  it("is a pure function with no model call", () => {
    const source = readFileSync(resolve(process.cwd(), "src/modules/guidance/assess.ts"), "utf8");
    expect(source).not.toContain("@/modules/ai");
    expect(source).not.toContain("updateProduct");
    expect(source).not.toContain("markOutcomeAchieved");
    const once = assessGuidance(snap({ discovery: briefApproved }));
    const twice = assessGuidance(snap({ discovery: briefApproved }));
    expect(twice).toEqual(once);
  });
});

describe("existing requirements next action", () => {
  function intake(patch: Partial<GuidanceSnapshot["intake"]> = {}): GuidanceSnapshot["intake"] {
    return {
      activeSources: 0,
      extractionFailed: false,
      analysed: false,
      stale: false,
      unreviewed: 0,
      needsChange: 0,
      blockingFindings: 0,
      openQuestions: 0,
      materialUnmapped: 0,
      updatedAt: null,
      ...patch,
    };
  }

  const openExplore = {
    startMode: "EXISTING_REQUIREMENTS" as const,
    discovery: { ...briefApproved, started: false, briefStatus: "NONE" as const, readyForReview: false },
  };

  it("asks for requirements before analysis", () => {
    expect(assessGuidance(snap(openExplore)).action?.label).toBe("Add your requirements");
    const analysed = assessGuidance(snap({ ...openExplore, intake: intake({ activeSources: 1, analysed: false }) }));
    expect(analysed.action?.label).toBe("Analyse requirements");
  });

  it("treats a changed source as a stale analysis", () => {
    const guidance = assessGuidance(snap({ ...openExplore, intake: intake({ activeSources: 1, analysed: false, stale: true }) }));
    expect(guidance.action?.label).toBe("Analyse requirements");
    expect(guidance.blocker?.what).toMatch(/out of date/i);
  });

  it("puts material findings and questions ahead of routine confirmation", () => {
    const findings = assessGuidance(snap({
      ...openExplore,
      intake: intake({ activeSources: 1, analysed: true, blockingFindings: 3, openQuestions: 2, unreviewed: 4 }),
    }));
    expect(findings.action?.label).toBe("Review 3 important findings");
    expect(findings.action?.decision).toBe(true);
    const question = assessGuidance(snap({
      ...openExplore,
      intake: intake({ activeSources: 1, analysed: true, openQuestions: 1, unreviewed: 4 }),
    }));
    expect(question.action?.label).toBe("Answer requirement question");
    const confirm = assessGuidance(snap({
      ...openExplore,
      intake: intake({ activeSources: 1, analysed: true, unreviewed: 2 }),
    }));
    expect(confirm.action?.label).toBe("Confirm requirement interpretation");
    expect(confirm.action?.decision).toBe(false);
  });

  it("reviews and approves the requirements brief, then moves to Define", () => {
    expect(assessGuidance(snap({
      ...openExplore,
      intake: intake({ activeSources: 1, analysed: true }),
      discovery: { ...briefApproved, briefStatus: "DRAFT", readyForReview: false },
    })).action?.label).toBe("Review requirements-derived Product Brief");
    expect(assessGuidance(snap({
      ...openExplore,
      intake: intake({ activeSources: 1, analysed: true }),
      discovery: { ...briefApproved, briefStatus: "READY_FOR_REVIEW" },
    })).action?.label).toBe("Approve Product Brief");
    expect(assessGuidance(snap({
      startMode: "EXISTING_REQUIREMENTS",
      discovery: briefApproved,
      intake: intake({ activeSources: 1, analysed: true }),
    })).action?.label).toBe("Move to Define");
  });

  it("asks to review unmapped requirements and a change after approval", () => {
    const unmapped = assessGuidance(snap({
      stage: "DEFINE",
      startMode: "EXISTING_REQUIREMENTS",
      discovery: briefApproved,
      definition: { ...defined, status: "IN_PROGRESS", approved: false, exists: true },
      intake: intake({ materialUnmapped: 2 }),
    }));
    expect(unmapped.action?.label).toBe("Review unmapped requirements");
    expect(unmapped.action?.decision).toBe(true);
    const changed = assessGuidance(snap({
      stage: "DEFINE",
      startMode: "EXISTING_REQUIREMENTS",
      discovery: briefApproved,
      definition: defined,
      requirementsChanged: true,
    }));
    expect(changed.action?.label).toBe("Review changed requirements");
  });

  it("leaves the idea path on discovery", () => {
    expect(assessGuidance(snap()).action?.label).toBe("Start Discovery");
  });
});

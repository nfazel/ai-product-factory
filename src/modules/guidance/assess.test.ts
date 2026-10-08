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
};

const reviewed: GuidanceSnapshot["review"] = {
  exists: true,
  approved: true,
  reviewRequired: false,
  reviewReason: "",
  openCritical: 0,
  openHighBeforeCoding: 0,
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
    expect(guidance.action?.label).toBe("Confirm First Slice");
  });

  it("offers Move to Build when the definition and slice are approved", () => {
    const guidance = assessGuidance(snap({
      stage: "DEFINE",
      discovery: briefApproved,
      definition: defined,
    }));
    expect(guidance.action?.key).toBe("move-build");
  });

  it("asks to approve design while architecture is waiting", () => {
    const guidance = assessGuidance(pastDefine({
      design: { ...designed, architecture: "DRAFT", plan: "NONE" },
    }));
    expect(guidance.action?.label).toBe("Approve Design");
  });

  it("blocks on an engineering finding instead of offering coding", () => {
    const guidance = assessGuidance(pastDefine({
      design: designed,
      review: { ...reviewed, approved: false, reviewRequired: true, reviewReason: "A high finding is open." },
    }));
    expect(guidance.action?.label).toBe("Resolve Engineering Finding");
    expect(guidance.blocker?.what).toBe("Engineering review needs attention");
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

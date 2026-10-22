import { describe, expect, it } from "vitest";

import { classifyMergeability, pullRequestNextAction, type PullRequestGate } from "@/modules/source-control/pull-request-gate";
import { decidePullRequestReadiness } from "@/modules/source-control/readiness";

const ready: PullRequestGate = {
  classified: true,
  protectionAccess: "NOT_PROTECTED",
  ciState: "PASSED",
  ciRequired: true,
  validApprovals: 1,
  requiredApprovals: 1,
  changesRequested: false,
  mergeability: "CLEAN",
  headMatches: true,
};

describe("pull request next action", () => {
  it("asks to refresh until GitHub evidence has been classified", () => {
    const action = pullRequestNextAction({ ...ready, classified: false, protectionAccess: "" });
    expect(action.key).toBe("refresh-pr");
    expect(action.why).toMatch(/does not approve/);
    expect(action.why).toMatch(/does not .*merge/);
  });

  it("names the GitHub App permission when branch protection cannot be read", () => {
    const action = pullRequestNextAction({ ...ready, protectionAccess: "FORBIDDEN", ciState: "UNKNOWN" });
    expect(action.label).toBe("Resolve GitHub App permissions");
    expect(action.why).toMatch(/Administration read/);
    expect(action.why).toMatch(/403/);
  });

  it("asks to configure CI when CI is required and absent", () => {
    const action = pullRequestNextAction({ ...ready, ciState: "NOT_CONFIGURED" });
    expect(action.label).toBe("Configure CI");
    expect(action.why).toMatch(/does not create that workflow/);
    expect(action.why).toMatch(/does not .*merge/);
  });

  it("continues past a recorded exception without calling the missing CI a pass", () => {
    const action = pullRequestNextAction({ ...ready, ciState: "NOT_CONFIGURED", ciRequired: false });
    expect(action.label).toBe("Ready for Human Merge");
    expect(action.why).toMatch(/does not merge/);
  });

  it("asks to resolve a failed check and to refresh a pending or unknown result", () => {
    expect(pullRequestNextAction({ ...ready, ciState: "FAILED" }).label).toBe("Resolve CI failure");
    expect(pullRequestNextAction({ ...ready, ciState: "PENDING" }).why).toMatch(/still running/);
    expect(pullRequestNextAction({ ...ready, ciState: "UNKNOWN" }).key).toBe("refresh-pr");
  });

  it("asks for a human review and shows how many approvals are valid", () => {
    const waiting = pullRequestNextAction({ ...ready, validApprovals: 0 });
    expect(waiting.label).toBe("Request human GitHub review");
    expect(waiting.why).toMatch(/0 of 1/);
    expect(waiting.why).toMatch(/does not submit that approval/);
    expect(pullRequestNextAction({ ...ready, changesRequested: true }).why).toMatch(/requests changes/);
  });

  it("asks to resolve conflicts and does not treat unknown mergeability as clean", () => {
    expect(pullRequestNextAction({ ...ready, mergeability: "CONFLICT" }).label).toBe("Resolve merge conflicts");
    const unknown = pullRequestNextAction({ ...ready, mergeability: "UNKNOWN" });
    expect(unknown.key).toBe("refresh-pr");
    expect(unknown.why).toMatch(/not treated as clean/);
    expect(classifyMergeability(null, "unknown")).toBe("UNKNOWN");
    expect(classifyMergeability(false, "dirty")).toBe("CONFLICT");
    expect(classifyMergeability(true, "clean")).toBe("CLEAN");
    expect(classifyMergeability(true, "blocked")).toBe("CLEAN");
  });

  it("says a person merges when the recorded gates are satisfied", () => {
    const action = pullRequestNextAction(ready);
    expect(action.label).toBe("Ready for Human Merge");
    expect(action.why).toMatch(/does not merge/);
  });
});

describe("review and merge readiness", () => {
  const head = "a".repeat(40);
  const base = {
    state: "OPEN",
    headSha: head,
    approvalCommit: head,
    approvalCurrent: true,
    verificationCommit: head,
    verificationApproved: true,
    verificationStale: false,
    checks: [{ name: "build", status: "COMPLETED", conclusion: "SUCCESS" }],
    requiredChecks: ["build"],
    ci: { state: "PASSED" as const, detail: "All required checks succeeded.", requirement: "REQUIRED" as const },
    mergeability: "CLEAN" as const,
    minimumHumanApprovals: 1,
    protectionApprovals: 1,
    governanceCurrent: true,
    policyCurrent: true,
    blockingDefect: false,
  };

  it("counts the latest human approval and ignores bots", () => {
    const decision = decidePullRequestReadiness({
      ...base,
      reviews: [
        { reviewer: "Ada", state: "CHANGES_REQUESTED", submittedAt: new Date(Date.now() - 1000), commitSha: head },
        { reviewer: "Ada", state: "APPROVED", submittedAt: new Date(), commitSha: head },
        { reviewer: "ai-product-builder[bot]", state: "APPROVED", submittedAt: new Date(), commitSha: head },
      ],
    });
    expect(decision.approvals).toEqual({ valid: 1, required: 1 });
    expect(decision.ready).toBe(true);
  });

  it("drops a dismissed approval and an approval of a different commit", () => {
    const dismissed = decidePullRequestReadiness({
      ...base,
      reviews: [
        { reviewer: "Ada", state: "APPROVED", submittedAt: new Date(Date.now() - 1000), commitSha: head },
        { reviewer: "Ada", state: "DISMISSED", submittedAt: new Date(), commitSha: head },
      ],
    });
    expect(dismissed.approvals.valid).toBe(0);
    const stale = decidePullRequestReadiness({
      ...base,
      reviews: [{ reviewer: "Ada", state: "APPROVED", submittedAt: new Date(), commitSha: "b".repeat(40) }],
    });
    expect(stale.approvals.valid).toBe(0);
    expect(stale.reasons.join(" ")).toMatch(/0 of 1/);
  });

  it("blocks conflicts and unknown mergeability", () => {
    expect(decidePullRequestReadiness({
      ...base,
      mergeability: "CONFLICT",
      reviews: [{ reviewer: "Ada", state: "APPROVED", submittedAt: new Date(), commitSha: head }],
    }).reasons.join(" ")).toMatch(/conflicts/);
    expect(decidePullRequestReadiness({
      ...base,
      mergeability: "UNKNOWN",
      reviews: [{ reviewer: "Ada", state: "APPROVED", submittedAt: new Date(), commitSha: head }],
    }).reasons.join(" ")).toMatch(/has not confirmed/);
  });
});

describe("pull request lifecycle after GitHub reports a result", () => {
  const head = "9abadcbfb2509ffad5902628e1d5bfcd5a8d7075";
  const mergeSha = "d".repeat(40);
  const open = {
    state: "OPEN",
    headSha: head,
    approvalCommit: head,
    approvalCurrent: true,
    verificationCommit: head,
    verificationApproved: true,
    verificationStale: false,
    checks: [{ name: "verify", status: "COMPLETED", conclusion: "SUCCESS" }],
    requiredChecks: [] as string[],
    ci: { state: "PASSED" as const, detail: "Observed checks succeeded.", requirement: "REQUIRED" as const },
    mergeability: "CLEAN" as const,
    reviews: [{ reviewer: "Ada", state: "APPROVED" as const, submittedAt: new Date(), commitSha: head }],
    minimumHumanApprovals: 1,
    protectionApprovals: 0,
    governanceCurrent: true,
    policyCurrent: true,
    blockingDefect: false,
    mergeCommitSha: "1c2f05b2abe7d9adb600692d830018381507ef05",
  };

  it("keeps an open pull request ready only when its checks are satisfied", () => {
    const ready = decidePullRequestReadiness(open);
    expect(ready.label).toBe("READY FOR HUMAN MERGE");
    expect(ready.reasons.join(" ")).not.toMatch(/MERGED/);
    const waiting = decidePullRequestReadiness({
      ...open,
      ci: { state: "FAILED", detail: "Check verify did not succeed.", requirement: "REQUIRED" },
      mergeability: "UNKNOWN",
    });
    expect(waiting.label).toBe("NOT READY");
    expect(waiting.reasons.join(" ")).toMatch(/verify/);
    expect(waiting.reasons.join(" ")).toMatch(/has not confirmed/);
  });

  it("records a verified merge without applying open mergeability checks", () => {
    const merged = decidePullRequestReadiness({
      ...open,
      state: "MERGED",
      mergeability: "UNKNOWN",
      verificationStale: true,
      ci: { state: "FAILED", detail: "Check verify did not succeed.", requirement: "REQUIRED" },
      mergeCommitSha: mergeSha,
      mergedAt: "2026-10-22T10:00:00.000Z",
      mergedBy: "Ada",
    });
    expect(merged.label).toBe("MERGED — COMPLETE");
    expect(merged.ready).toBe(false);
    expect(merged.reasons.join(" ")).toMatch(new RegExp(mergeSha));
    expect(merged.reasons.join(" ")).toMatch(/unchanged/);
    expect(merged.reasons.join(" ")).not.toMatch(/has not confirmed/);
    expect(merged.reasons.join(" ")).not.toMatch(/did not succeed/);
    expect(merged.approvals).toEqual({ valid: 1, required: 1 });
  });

  it("does not treat a closed pull request as merged", () => {
    const closed = decidePullRequestReadiness({
      ...open,
      state: "CLOSED",
      mergeability: "UNKNOWN",
      mergeCommitSha: "1c2f05b2abe7d9adb600692d830018381507ef05",
    });
    expect(closed.label).toBe("NOT READY");
    expect(closed.reasons).toEqual(["The pull request is CLOSED and was not merged."]);
    expect(closed.reasons.join(" ")).not.toMatch(/has not confirmed/);
    expect(closed.label).not.toBe("MERGED — COMPLETE");
  });

  it("requires verification when merge evidence is missing", () => {
    const missing = decidePullRequestReadiness({
      ...open,
      state: "MERGED",
      mergeability: "UNKNOWN",
      mergeCommitSha: "",
      mergedAt: null,
      mergedBy: "",
    });
    expect(missing.label).toBe("MERGED — VERIFICATION REQUIRED");
    expect(missing.reasons.join(" ")).toMatch(/merge commit SHA is missing/);
    expect(missing.reasons.join(" ")).toMatch(/merge time/);
    expect(missing.reasons.join(" ")).toMatch(/person who merged/);
    expect(missing.reasons.join(" ")).not.toMatch(/has not confirmed/);
    expect(missing.reasons.join(" ")).not.toMatch(/did not succeed/);
  });

  it("requires verification when the merged head does not match the approved commit", () => {
    const inconsistent = decidePullRequestReadiness({
      ...open,
      state: "MERGED",
      headSha: "b".repeat(40),
      mergeability: "CLEAN",
      mergeCommitSha: mergeSha,
      mergedAt: "2026-10-22T10:00:00.000Z",
      mergedBy: "Ada",
    });
    expect(inconsistent.label).toBe("MERGED — VERIFICATION REQUIRED");
    expect(inconsistent.reasons.join(" ")).toMatch(/approved implementation commit/);
    expect(inconsistent.reasons.join(" ")).not.toMatch(/has not confirmed/);
  });
});

import { ciReadinessReason, type CiStateName } from "@/modules/source-control/ci-state";

const NON_HUMAN = [
  "coding agent",
  "testing agent",
  "testing & verification agent",
  "verification agent",
  "architecture agent",
  "security agent",
  "security & engineering governance agent",
  "ai product factory",
];

export function countsAsHumanReviewer(reviewer: string, serviceAccount = "") {
  const name = reviewer.trim().toLowerCase();
  if (!name) return false;
  if (name.endsWith("[bot]") || name.endsWith("-bot")) return false;
  if (serviceAccount && name === serviceAccount.trim().toLowerCase()) return false;
  return !NON_HUMAN.some((agent) => name === agent || name.includes(agent));
}

export type ReadinessReview = { reviewer: string; state: string; submittedAt: Date | null; commitSha?: string };

export function latestReviews(reviews: ReadinessReview[]) {
  const ordered = [...reviews].sort((a, b) => (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0));
  const latest = new Map<string, ReadinessReview>();
  for (const review of ordered) latest.set(review.reviewer.trim().toLowerCase(), review);
  return [...latest.values()];
}

export function effectiveReviews(reviews: ReadinessReview[], headSha: string) {
  return latestReviews(reviews).filter((review) => {
    if (review.state === "DISMISSED") return false;
    if (review.commitSha && review.commitSha.toLowerCase() !== headSha.toLowerCase()) return false;
    return true;
  });
}

export function decidePullRequestReadiness(input: {
  state: string;
  headSha: string;
  approvalCommit: string;
  approvalCurrent: boolean;
  verificationCommit: string;
  verificationApproved: boolean;
  verificationStale: boolean;
  checks: { name: string; status: string; conclusion: string }[];
  requiredChecks: string[] | null;
  ci?: { state: CiStateName; detail: string; requirement: "REQUIRED" | "EXCEPTION" };
  mergeability?: "CLEAN" | "CONFLICT" | "UNKNOWN" | "UNREAD";
  reviews: ReadinessReview[];
  minimumHumanApprovals: number;
  protectionApprovals: number;
  governanceCurrent: boolean;
  policyCurrent: boolean;
  blockingDefect: boolean;
  serviceAccount?: string;
  mergeCommitSha?: string;
  mergedAt?: Date | string | null;
  mergedBy?: string;
}) {
  if (input.state === "MERGED") return decideMergedReadiness(input);
  if (input.state === "CLOSED") return closedReadiness(input);
  const reasons: string[] = [];
  if (input.state !== "OPEN") reasons.push(`The pull request is ${input.state}.`);
  if (!input.approvalCurrent || input.approvalCommit !== input.headSha) {
    reasons.push("The code approval does not match the pull request head.");
  }
  if (input.verificationStale || input.verificationCommit !== input.headSha) {
    reasons.push("VERIFICATION STALE");
  } else if (!input.verificationApproved) {
    reasons.push("Verification approval is missing for this commit.");
  }
  if (input.mergeability === "CONFLICT") reasons.push("GitHub reports merge conflicts.");
  if (input.mergeability === "UNKNOWN") reasons.push("GitHub has not confirmed that the pull request can merge.");
  if (input.ci) {
    const ciReason = ciReadinessReason(input.ci);
    if (ciReason) reasons.push(ciReason);
  } else if (input.requiredChecks === null) {
    reasons.push("CI status is unknown.");
  } else {
    for (const name of input.requiredChecks) {
      const check = input.checks.find((item) => item.name === name);
      if (!check || check.status !== "COMPLETED" || check.conclusion !== "SUCCESS") {
        reasons.push(`Required check ${name} did not succeed.`);
      }
    }
  }
  const approvals = countApprovals(input);
  if (approvals.latest.some((review) => review.state === "CHANGES_REQUESTED")) {
    reasons.push("CHANGES REQUESTED");
  }
  if (approvals.valid < approvals.required) {
    reasons.push(`A human GitHub approval is required. ${approvals.valid} of ${approvals.required} approvals are valid.`);
  }
  if (!input.governanceCurrent) reasons.push("Engineering Governance is not current.");
  if (!input.policyCurrent) reasons.push("Coding Policy is not current.");
  if (input.blockingDefect) reasons.push("A blocking defect is open.");
  const approvalCounts = { valid: approvals.valid, required: approvals.required };
  if (reasons.length > 0) return { label: "NOT READY" as const, ready: false, reasons, approvals: approvalCounts };
  return {
    label: "READY FOR HUMAN MERGE" as const,
    ready: true,
    reasons: ["Open the pull request in GitHub. A person merges it there. AI Product Builder does not merge it."],
    approvals: approvalCounts,
  };
}

function countApprovals(input: {
  headSha: string;
  reviews: ReadinessReview[];
  minimumHumanApprovals: number;
  protectionApprovals: number;
  serviceAccount?: string;
}) {
  const latest = effectiveReviews(input.reviews, input.headSha);
  const valid = latest.filter(
    (review) => review.state === "APPROVED" && countsAsHumanReviewer(review.reviewer, input.serviceAccount),
  ).length;
  const required = Math.max(input.minimumHumanApprovals, input.protectionApprovals, 1);
  return { latest, valid, required };
}

function closedReadiness(input: Parameters<typeof countApprovals>[0]) {
  const approvals = countApprovals(input);
  return {
    label: "NOT READY" as const,
    ready: false,
    reasons: ["The pull request is CLOSED and was not merged."],
    approvals: { valid: approvals.valid, required: approvals.required },
  };
}

function decideMergedReadiness(input: Parameters<typeof countApprovals>[0] & {
  headSha: string;
  approvalCommit: string;
  approvalCurrent: boolean;
  mergeCommitSha?: string;
  mergedAt?: Date | string | null;
  mergedBy?: string;
}) {
  const approvals = countApprovals(input);
  const approvalCounts = { valid: approvals.valid, required: approvals.required };
  const mergeCommitSha = input.mergeCommitSha?.trim() ?? "";
  const mergedBy = input.mergedBy?.trim() ?? "";
  const mergedAt = input.mergedAt ? new Date(input.mergedAt) : null;
  const mergeTimeKnown = mergedAt !== null && !Number.isNaN(mergedAt.getTime());
  const headKnown = /^[0-9a-f]{40}$/i.test(input.headSha);
  const headMatchesApproval = Boolean(input.approvalCurrent) && headKnown && input.approvalCommit.toLowerCase() === input.headSha.toLowerCase();
  const problems: string[] = [];
  if (!/^[0-9a-f]{40}$/i.test(mergeCommitSha)) {
    problems.push("The merge commit SHA is missing. An open pull request test merge SHA is not evidence of a completed merge.");
  }
  if (!mergeTimeKnown) problems.push("GitHub did not provide the merge time.");
  if (!mergedBy) problems.push("GitHub did not provide the person who merged the pull request.");
  if (!headMatchesApproval) problems.push("The merged pull request head does not match the approved implementation commit.");
  if (problems.length > 0) {
    return { label: "MERGED — VERIFICATION REQUIRED" as const, ready: false, reasons: problems, approvals: approvalCounts };
  }
  return {
    label: "MERGED — COMPLETE" as const,
    ready: false,
    reasons: [
      `GitHub reports the pull request merged as ${mergeCommitSha} by ${mergedBy} at ${mergedAt?.toISOString()}. The approved head remains ${input.headSha}. Recorded CI, verification, and publication evidence are unchanged.`,
    ],
    approvals: approvalCounts,
  };
}

export function decideReleaseCandidate(input: {
  hasApprovedSlice: boolean;
  tasks: { completed: boolean; verified: boolean; merged: boolean }[];
  blockingDefect: boolean;
  integratedRecorded: boolean;
}) {
  const reasons: string[] = [];
  if (!input.hasApprovedSlice) reasons.push("No approved product slice.");
  if (input.tasks.length === 0) reasons.push("The approved slice has no implementation tasks.");
  if (input.tasks.some((task) => !task.completed)) reasons.push("An implementation task is not completed.");
  if (input.tasks.some((task) => !task.verified)) reasons.push("An implementation task is not independently verified.");
  if (input.tasks.some((task) => !task.merged)) reasons.push("An implementation task does not have a merged pull request.");
  if (input.blockingDefect) reasons.push("A blocking defect is open.");
  if (!input.integratedRecorded) reasons.push("Integrated verification has not been recorded.");
  if (reasons.length > 0) return { label: "NOT READY" as const, ready: false, reasons };
  return {
    label: "RELEASE CANDIDATE READY FOR REVIEW" as const,
    ready: true,
    reasons: ["The slice is prepared for a future release review. The stage does not move automatically."],
  };
}

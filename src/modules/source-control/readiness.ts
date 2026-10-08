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

export type ReadinessReview = { reviewer: string; state: string; submittedAt: Date | null };

export function latestReviews(reviews: ReadinessReview[]) {
  const ordered = [...reviews].sort((a, b) => (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0));
  const latest = new Map<string, ReadinessReview>();
  for (const review of ordered) latest.set(review.reviewer.trim().toLowerCase(), review);
  return [...latest.values()];
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
  reviews: ReadinessReview[];
  minimumHumanApprovals: number;
  protectionApprovals: number;
  governanceCurrent: boolean;
  policyCurrent: boolean;
  blockingDefect: boolean;
  serviceAccount?: string;
}) {
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
  if (input.requiredChecks === null) {
    reasons.push("CI status is unknown.");
  } else {
    for (const name of input.requiredChecks) {
      const check = input.checks.find((item) => item.name === name);
      if (!check || check.status !== "COMPLETED" || check.conclusion !== "SUCCESS") {
        reasons.push(`Required check ${name} did not succeed.`);
      }
    }
  }
  const latest = latestReviews(input.reviews);
  if (latest.some((review) => review.state === "CHANGES_REQUESTED")) {
    reasons.push("CHANGES REQUESTED");
  }
  const humanApprovals = latest.filter(
    (review) => review.state === "APPROVED" && countsAsHumanReviewer(review.reviewer, input.serviceAccount),
  ).length;
  const required = Math.max(input.minimumHumanApprovals, input.protectionApprovals, 1);
  if (humanApprovals < required) reasons.push("A human GitHub approval is required.");
  if (!input.governanceCurrent) reasons.push("Engineering Governance is not current.");
  if (!input.policyCurrent) reasons.push("Coding Policy is not current.");
  if (input.blockingDefect) reasons.push("A blocking defect is open.");
  if (reasons.length > 0) return { label: "NOT READY" as const, ready: false, reasons };
  return { label: "READY FOR HUMAN MERGE" as const, ready: true, reasons: ["Open the pull request in GitHub. A person merges it there."] };
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

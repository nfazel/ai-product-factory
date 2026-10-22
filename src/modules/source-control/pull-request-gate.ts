export type PullRequestNextKey =
  | "resolve-github-permissions"
  | "configure-ci"
  | "resolve-ci-failure"
  | "resolve-merge-conflicts"
  | "request-github-review"
  | "refresh-pr"
  | "ready-for-merge";

export type PullRequestGate = {
  classified: boolean;
  protectionAccess: "" | "READABLE" | "NOT_PROTECTED" | "FORBIDDEN" | "UNAVAILABLE";
  ciState: "PASSED" | "FAILED" | "PENDING" | "NOT_CONFIGURED" | "UNKNOWN";
  ciRequired: boolean;
  validApprovals: number;
  requiredApprovals: number;
  changesRequested: boolean;
  mergeability: "CLEAN" | "CONFLICT" | "UNKNOWN" | "UNREAD";
  headMatches: boolean;
};

const REFRESH_LIMIT = "Refresh reads GitHub evidence. It does not approve the pull request or merge it.";

export function pullRequestNextAction(gate: PullRequestGate): { key: PullRequestNextKey; label: string; why: string } {
  if (!gate.classified) {
    return {
      key: "refresh-pr",
      label: "Refresh Pull Request",
      why: `GitHub evidence has not been classified yet. ${REFRESH_LIMIT}`,
    };
  }
  if (gate.protectionAccess === "FORBIDDEN") {
    return {
      key: "resolve-github-permissions",
      label: "Resolve GitHub App permissions",
      why: `Branch protection returned 403. Grant the GitHub App Administration read, then refresh. ${REFRESH_LIMIT}`,
    };
  }
  if (!gate.headMatches) {
    return {
      key: "refresh-pr",
      label: "Refresh Pull Request",
      why: `The pull request head does not match the approved commit. ${REFRESH_LIMIT}`,
    };
  }
  if (gate.mergeability === "CONFLICT") {
    return {
      key: "resolve-merge-conflicts",
      label: "Resolve merge conflicts",
      why: "GitHub reports that the pull request has conflicts. Resolving them does not approve or merge it.",
    };
  }
  if (gate.mergeability === "UNKNOWN") {
    return {
      key: "refresh-pr",
      label: "Refresh Pull Request",
      why: `GitHub has not reported whether the pull request can merge. Unknown mergeability is not treated as clean. ${REFRESH_LIMIT}`,
    };
  }
  if (gate.ciState === "FAILED") {
    return {
      key: "resolve-ci-failure",
      label: "Resolve CI failure",
      why: `A required check failed. ${REFRESH_LIMIT}`,
    };
  }
  if (gate.ciState === "PENDING" || gate.ciState === "UNKNOWN") {
    return {
      key: "refresh-pr",
      label: "Refresh Pull Request",
      why: gate.ciState === "PENDING"
        ? `Checks are still running. ${REFRESH_LIMIT}`
        : `CI requirements could not be determined. ${REFRESH_LIMIT}`,
    };
  }
  if (gate.ciState === "NOT_CONFIGURED" && gate.ciRequired) {
    return {
      key: "configure-ci",
      label: "Configure CI",
      why: "CI is required and none is configured. Add a workflow in the product repository. AI Product Builder does not create that workflow, approve the pull request, or merge.",
    };
  }
  if (gate.changesRequested || gate.validApprovals < gate.requiredApprovals) {
    return {
      key: "request-github-review",
      label: "Request human GitHub review",
      why: gate.changesRequested
        ? `The latest human review requests changes. ${gate.validApprovals} of ${gate.requiredApprovals} approvals are valid. A review in GitHub is not performed by refresh.`
        : `${gate.validApprovals} of ${gate.requiredApprovals} human GitHub approvals are valid. Refresh does not submit that approval.`,
    };
  }
  return {
    key: "ready-for-merge",
    label: "Ready for Human Merge",
    why: "The recorded gates are satisfied. A person merges the pull request in GitHub. AI Product Builder does not merge it.",
  };
}

export function classifyMergeability(mergeable: boolean | null | undefined, mergeableState: string | null | undefined): "CLEAN" | "CONFLICT" | "UNKNOWN" | "UNREAD" {
  if (mergeable === undefined && (mergeableState === undefined || mergeableState === "")) return "UNREAD";
  const state = (mergeableState ?? "").toLowerCase();
  if (state === "dirty" || state === "conflicting") return "CONFLICT";
  if (mergeable === null || state === "unknown" || state === "") return "UNKNOWN";
  return "CLEAN";
}

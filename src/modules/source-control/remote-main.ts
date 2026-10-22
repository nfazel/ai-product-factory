const SHA = /^[0-9a-f]{40}$/i;

export type PublishedBranchFact = {
  branch: string;
  approvedSha: string;
  localSha: string;
  remoteSha: string | null;
  recordedBaselineSha: string;
  baselineIsAncestor: boolean;
};

export type RemoteMainInput = {
  configuredRepository: string;
  observedRepository: string;
  githubDefaultBranch: string;
  remoteMainSha: string | null;
  localMainSha: string;
  published: PublishedBranchFact[];
};

export type RemoteMainDecision = {
  status: "hidden" | "offer" | "ready" | "blocked" | "other-default";
  message: string;
  repository: string;
  baselineSha: string;
  remoteSha: string;
  defaultBranch: string;
};

export function decideRemoteMain(input: RemoteMainInput): RemoteMainDecision {
  const decision = {
    repository: input.configuredRepository,
    baselineSha: input.localMainSha,
    remoteSha: input.remoteMainSha ?? "",
    defaultBranch: input.githubDefaultBranch,
  };
  if (input.published.length === 0) return { ...decision, status: "hidden", message: "" };
  const defaultName = input.githubDefaultBranch || "unset";
  const defaultReport = input.githubDefaultBranch.toLowerCase() === "main"
    ? ""
    : `GitHub's default branch is ${defaultName}. Repository settings were not changed. `;
  if (input.remoteMainSha) {
    return { ...decision, status: "ready", message: `${defaultReport}Remote main exists.`.trim() };
  }
  const reasons: string[] = [];
  if (!input.configuredRepository || input.configuredRepository.toLowerCase() !== input.observedRepository.toLowerCase()) {
    reasons.push("The configured GitHub repository does not match the repository that would receive the branch.");
  }
  if (!SHA.test(input.localMainSha)) reasons.push("The local main branch does not exist.");
  for (const branch of input.published) {
    if (!SHA.test(branch.recordedBaselineSha)) reasons.push("The recorded baseline commit is missing.");
    else if (SHA.test(input.localMainSha) && branch.recordedBaselineSha.toLowerCase() !== input.localMainSha.toLowerCase()) {
      reasons.push("The local main branch does not match the recorded baseline commit.");
    }
    if (SHA.test(input.localMainSha) && SHA.test(branch.approvedSha) && input.localMainSha.toLowerCase() === branch.approvedSha.toLowerCase()) {
      reasons.push("The baseline commit already contains the approved task implementation.");
    } else if (SHA.test(input.localMainSha) && SHA.test(branch.approvedSha) && !branch.baselineIsAncestor) {
      reasons.push("The baseline commit is not an ancestor of the published task commit.");
    }
    if (!branch.branch || !SHA.test(branch.approvedSha) || branch.localSha.toLowerCase() !== branch.approvedSha.toLowerCase() || (branch.remoteSha ?? "").toLowerCase() !== branch.approvedSha.toLowerCase()) {
      reasons.push("The published task branch does not match the approved commit.");
    }
  }
  if (reasons.length > 0) return { ...decision, status: "blocked", message: `${defaultReport}${[...new Set(reasons)].join(" ")}`.trim() };
  return {
    ...decision,
    status: "offer",
    message: `${defaultReport}Remote main does not exist. The baseline commit can be published as main.`.trim(),
  };
}

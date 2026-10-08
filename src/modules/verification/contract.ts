import { hashText } from "@/modules/coding/policy";
import { asStrings } from "@/modules/coding/strings";

export const REQUIRED_AREAS = [
  "Acceptance criteria",
  "Functional behaviour",
  "Negative paths",
  "Regression",
  "Security-relevant behaviour",
  "NFRs",
  "Evidence completeness",
];

export function buildVerificationContract(input: {
  objective: string;
  storyTitle: string;
  criteria: { id: string; description: string }[];
  nfrs: { id: string; title: string }[];
  architecture: string;
  security: string;
  codingSummary: string;
  commitSha: string;
  changedFiles: string[];
}) {
  const acceptanceCriteria = input.criteria.map((item) => `${item.id}: ${item.description}`);
  const nfrs = input.nfrs.map((item) => `${item.id}: ${item.title}`);
  return {
    objective: input.objective,
    storyTitle: input.storyTitle,
    acceptanceCriteria,
    nfrs,
    architectureConstraints: input.architecture,
    securityConstraints: input.security,
    codingContractSummary: input.codingSummary,
    commitSha: input.commitSha,
    changedFiles: input.changedFiles,
    requiredAreas: REQUIRED_AREAS,
    sourceFingerprint: hashText(
      JSON.stringify({
        objective: input.objective,
        acceptanceCriteria,
        nfrs,
        architecture: input.architecture,
        security: input.security,
        commitSha: input.commitSha,
        changedFiles: input.changedFiles,
      }),
    ),
  };
}

export function contractText(contract: {
  objective: string;
  storyTitle: string;
  acceptanceCriteria: unknown;
  nfrs: unknown;
  architectureConstraints: string;
  securityConstraints: string;
  codingContractSummary: string;
  commitSha: string;
  changedFiles: unknown;
}) {
  return [
    `Objective: ${contract.objective}`,
    `Story: ${contract.storyTitle}`,
    `Acceptance criteria: ${asStrings(contract.acceptanceCriteria).join(" | ") || "none"}`,
    `NFRs: ${asStrings(contract.nfrs).join(" | ") || "none"}`,
    `Architecture: ${contract.architectureConstraints}`,
    `Security: ${contract.securityConstraints}`,
    `Coding contract: ${contract.codingContractSummary}`,
    `Commit: ${contract.commitSha}`,
    `Changed files: ${asStrings(contract.changedFiles).join(", ") || "none"}`,
  ].join("\n");
}

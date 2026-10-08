import { redactSecrets } from "@/modules/source-control/redact";

export function buildPullRequestBody(input: {
  summary: string;
  outcome: string;
  capability: string;
  story: string;
  criteria: string[];
  taskTitle: string;
  architecture: string;
  changes: string;
  files: string[];
  verification: string[];
  regression: string;
  governance: string;
  approvals: string[];
  productId: string;
  storyId: string;
  taskId: string;
  sessionId: string;
  commitSha: string;
}) {
  const lines = [
    "## Summary",
    input.summary || "Implementation prepared in AI Product Builder.",
    "",
    "## Product Outcome",
    input.outcome || "Not linked.",
    "",
    "## Capability",
    input.capability || "Not linked.",
    "",
    "## Story",
    input.story || "Not linked.",
    "",
    "## Acceptance Criteria",
    ...(input.criteria.length > 0 ? input.criteria.map((item) => `- ${item}`) : ["- None linked."]),
    "",
    "## Implementation",
    `Task: ${input.taskTitle}`,
    "",
    "## Architecture",
    input.architecture || "No architecture summary is linked.",
    "",
    "## Key Changes",
    input.changes || "See the files changed.",
    "",
    "## Files Changed",
    ...(input.files.length > 0 ? input.files.map((file) => `- ${file}`) : ["- None recorded."]),
    "",
    "## Verification",
    ...(input.verification.length > 0 ? input.verification : ["- Verification has not been approved for this commit."]),
    `Regression: ${input.regression}`,
    "",
    "## Governance",
    `Engineering Governance: ${input.governance}`,
    "",
    "## Human Approvals",
    ...(input.approvals.length > 0 ? input.approvals.map((item) => `- ${item}`) : ["- None recorded."]),
    "",
    "## Record identifiers",
    `Product ID: ${input.productId}`,
    `Story ID: ${input.storyId || "none"}`,
    `Task ID: ${input.taskId}`,
    `Verification Session ID: ${input.sessionId || "none"}`,
    `Commit SHA: ${input.commitSha}`,
  ];
  return redactSecrets(lines.join("\n"));
}

export type NextActionExecution = "navigate" | "command" | "confirm";

export type NextActionDestination = {
  path: string;
  hash: string;
  /** move and generate run from the next-action panel. hash scrolls to a section. settings leaves the product page. */
  kind?: "hash" | "move" | "generate" | "settings";
  /**
   * navigate opens a section. command submits the existing workflow.
   * confirm opens the section where a person must take the separate confirmation step.
   */
  execution?: NextActionExecution;
};

export const NEXT_ACTION_DESTINATIONS = {
  "add-requirements": { path: "/discovery", hash: "add" },
  "analyse-requirements": { path: "/discovery", hash: "analyse" },
  "review-findings": { path: "/discovery", hash: "findings" },
  "answer-requirement-question": { path: "/discovery", hash: "questions" },
  "confirm-interpretation": { path: "/discovery", hash: "requirements" },
  "review-requirements-brief": { path: "/discovery", hash: "brief" },
  "approve-brief": { path: "/discovery", hash: "approve" },
  "review-changed-requirements": { path: "/discovery", hash: "sources" },
  "start-discovery": { path: "/discovery", hash: "", kind: "hash" },
  "answer-questions": { path: "/discovery", hash: "questions" },
  "review-brief": { path: "/discovery", hash: "brief" },
  "move-define": { path: "/discovery", hash: "move", kind: "move" },
  "review-unmapped": { path: "/definition", hash: "requirements" },
  "review-definition": { path: "/definition", hash: "proposal" },
  "draft-definition": { path: "/definition", hash: "", kind: "generate" },
  "confirm-definition": { path: "/definition", hash: "outcomes" },
  "confirm-slice": { path: "/definition", hash: "slice" },
  "answer-definition-questions": { path: "/definition", hash: "questions" },
  "prepare-definition": { path: "/definition", hash: "approve" },
  "approve-definition": { path: "/definition", hash: "approve" },
  "move-build": { path: "/definition", hash: "move", kind: "move" },
  "repair-traceability": { path: "/build", hash: "design" },
  "move-prove": { path: "/testing", hash: "move", kind: "move" },
  "choose-development-context": { path: "/build", hash: "context" },
  "add-codebase-context": { path: "/build", hash: "context" },
  "review-design": { path: "/build", hash: "design" },
  "prepare-design": { path: "/build", hash: "design" },
  "approve-design": { path: "/build", hash: "design" },
  "review-plan": { path: "/build", hash: "plan" },
  "prepare-plan": { path: "/build", hash: "plan" },
  "approve-plan": { path: "/build", hash: "plan" },
  "resolve-finding": { path: "/build", hash: "review" },
  "review-open-findings": { path: "/build", hash: "review" },
  "approve-review": { path: "/build", hash: "review" },
  "approve-rules": { path: "/build", hash: "review" },
  "approve-task": { path: "/build", hash: "code" },
  "setup-repository": { path: "/build", hash: "repository" },
  "generate-execution-plan": { path: "/build", hash: "execution-plan" },
  "review-execution-plan": { path: "/build", hash: "execution-plan" },
  "revise-execution-plan": { path: "/build", hash: "execution-plan" },
  "start-coding": { path: "/build", hash: "execution-plan" },
  "view-coding-progress": { path: "/build", hash: "coding-progress" },
  "review-coding-failure": { path: "/build", hash: "coding-progress" },
  "retry-coding": { path: "/build", hash: "coding-progress" },
  "repair-implementation": { path: "/build", hash: "coding-progress" },
  "record-repair-result": { path: "/build", hash: "coding-progress" },
  "resolve-coding-blocker": { path: "/build", hash: "coding-progress" },
  "restore-unapproved-change": { path: "/build", hash: "coding-progress" },
  "review-change": { path: "/build", hash: "code" },
  "approve-change": { path: "/build", hash: "code", execution: "confirm" },
  "create-commit": { path: "/build", hash: "code", execution: "confirm" },
  "start-check": { path: "/testing", hash: "check", execution: "command" },
  "view-verification": { path: "/testing", hash: "check", execution: "navigate" },
  "retry-verification": { path: "/testing", hash: "check", execution: "command" },
  "review-verification": { path: "/testing", hash: "check", execution: "confirm" },
  "approve-verification": { path: "/testing", hash: "check", execution: "confirm" },
  "review-verification-findings": { path: "/testing", hash: "check", execution: "confirm" },
  "configure-github": { path: "/settings", hash: "github", kind: "settings" },
  "choose-product-repository": { path: "/build", hash: "repository" },
  "publish-branch": { path: "/testing", hash: "publish", execution: "confirm" },
  "initialize-remote-main": { path: "/testing", hash: "publish", execution: "confirm" },
  "create-pr": { path: "/testing", hash: "publish" },
  "refresh-pr": { path: "/testing", hash: "publish" },
  "configure-ci": { path: "/testing", hash: "publish" },
  "resolve-github-permissions": { path: "/testing", hash: "publish" },
  "resolve-ci-failure": { path: "/testing", hash: "publish" },
  "resolve-merge-conflicts": { path: "/testing", hash: "publish" },
  "request-github-review": { path: "/testing", hash: "publish" },
  "ready-for-merge": { path: "/testing", hash: "publish" },
  "review-release": { path: "/releases", hash: "", kind: "hash" },
  "accept-risk": { path: "/releases", hash: "risk" },
  "approve-release": { path: "/releases", hash: "approval" },
  "record-deployment": { path: "/releases", hash: "deployment" },
  "record-check": { path: "/releases", hash: "checks" },
  "move-learn": { path: "/metrics", hash: "move", kind: "move" },
  "record-evidence": { path: "/metrics", hash: "evidence" },
  "record-decision": { path: "/metrics", hash: "decision" },
} as const satisfies Record<string, NextActionDestination>;

export type NextActionKey = keyof typeof NEXT_ACTION_DESTINATIONS;

export function nextActionDestination(key: string): NextActionDestination {
  if (!Object.hasOwn(NEXT_ACTION_DESTINATIONS, key)) {
    throw new Error(`Next action ${key} has no executable destination.`);
  }
  return NEXT_ACTION_DESTINATIONS[key as NextActionKey];
}

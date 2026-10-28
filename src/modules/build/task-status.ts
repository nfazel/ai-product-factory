import type { getCodingView } from "@/modules/coding/service";

export type CodingTask = NonNullable<Awaited<ReturnType<typeof getCodingView>>>["tasks"][number];

export type VerificationSnapshot = {
  implementationTaskId: string;
  status: string;
  overallVerdict: string | null;
};

export type StatusTone = "neutral" | "progress" | "success" | "attention" | "blocked";

export type BuildTaskRow = {
  id: string;
  title: string;
  objective: string;
  taskStatus: string;
  taskStatusLabel: string;
  codingStatus: string;
  codingTone: StatusTone;
  validationStatus: string;
  validationTone: StatusTone;
  approvalStatus: string;
  approvalTone: StatusTone;
  verificationStatus: string;
  verificationTone: StatusTone;
  attention: boolean;
  completed: boolean;
  inProgress: boolean;
  nextAction: string;
  blockers: string[];
  latestCodingOutcome: string;
  primaryAction: PrimaryAction | null;
  whyNoAction: string | null;
};

export type PrimaryAction =
  | { kind: "approve-task"; label: string }
  | { kind: "start-coding"; label: string }
  | { kind: "open-plan"; label: string }
  | { kind: "review-code"; label: string }
  | { kind: "validate-existing"; label: string }
  | { kind: "recover-workspace"; label: string }
  | { kind: "open-prove"; label: string };

export type BuildOverviewSummary = {
  total: number;
  completed: number;
  inProgress: number;
  attention: number;
  rows: BuildTaskRow[];
};

const TASK_STATUS_LABEL: Record<string, string> = {
  PROPOSED: "Proposed",
  APPROVED: "Approved",
  IN_PROGRESS: "In progress",
  CODE_REVIEW: "Code review",
  COMPLETED: "Completed",
  BLOCKED: "Blocked",
};

export function buildOverviewSummary(
  tasks: CodingTask[],
  verifications: VerificationSnapshot[] = [],
): BuildOverviewSummary {
  const rows = tasks.map((task) =>
    summariseBuildTask(
      task,
      verifications.find((item) => item.implementationTaskId === task.id) ?? null,
    ),
  );
  return {
    total: rows.length,
    completed: rows.filter((row) => row.completed).length,
    inProgress: rows.filter((row) => row.inProgress).length,
    attention: rows.filter((row) => row.attention).length,
    rows,
  };
}

export function summariseBuildTask(
  task: CodingTask,
  verification: VerificationSnapshot | null = null,
): BuildTaskRow {
  const workspace = task.workspace;
  const latestRun = workspace?.implementRuns?.at(-1) ?? null;
  const coding = codingStatus(task);
  const validation = validationStatus(task);
  const approval = approvalStatus(task);
  const verify = verificationStatus(task, verification);
  const blockers = [...task.blockers];
  if (workspace?.stale) blockers.push(workspace.staleReason || "Approved coding instructions are out of date.");
  if (workspace?.planIncomplete) blockers.push("Execution plan must be revised before coding can continue.");

  const completed = task.status === "COMPLETED" || workspace?.status === "COMPLETED";
  const inProgress =
    !completed &&
    (task.status === "IN_PROGRESS" ||
      task.status === "CODE_REVIEW" ||
      workspace?.status === "ACTIVE" ||
      workspace?.status === "READY_FOR_REVIEW" ||
      (task.status === "APPROVED" && Boolean(workspace)));
  const attention =
    !completed &&
    (task.status === "BLOCKED" ||
      blockers.length > 0 ||
      workspace?.status === "FAILED" ||
      coding.tone === "attention" ||
      validation.tone === "attention" ||
      approval.tone === "attention" ||
      verify.tone === "attention" ||
      verify.tone === "blocked");

  const primary = primaryAction(task, verify);
  return {
    id: task.id,
    title: task.title,
    objective: task.objective,
    taskStatus: task.status,
    taskStatusLabel: TASK_STATUS_LABEL[task.status] ?? task.status,
    codingStatus: coding.label,
    codingTone: coding.tone,
    validationStatus: validation.label,
    validationTone: validation.tone,
    approvalStatus: approval.label,
    approvalTone: approval.tone,
    verificationStatus: verify.label,
    verificationTone: verify.tone,
    attention,
    completed,
    inProgress,
    nextAction: primary?.label ?? explainIdle(task, blockers),
    blockers,
    latestCodingOutcome: latestCodingOutcome(latestRun, workspace?.status ?? null),
    primaryAction: primary,
    whyNoAction: primary ? null : explainIdle(task, blockers),
  };
}

function codingStatus(task: CodingTask): { label: string; tone: StatusTone } {
  const workspace = task.workspace;
  if (!workspace) {
    if (task.status === "PROPOSED") return { label: "Awaiting task approval", tone: "attention" };
    if (task.status === "APPROVED") return { label: "Not started", tone: "neutral" };
    return { label: "Not started", tone: "neutral" };
  }
  const plan = workspace.plan;
  if (workspace.status === "COMPLETED" && !planNeedsHumanReview(plan?.status)) {
    return { label: "Completed", tone: "success" };
  }
  if (workspace.status === "ABANDONED") return { label: "Abandoned", tone: "neutral" };
  if (workspace.status === "ACTIVE") return { label: "Running", tone: "progress" };
  // A proposed plan revision on an implemented workspace is waiting for approval, not a coding restart.
  if (planNeedsHumanReview(plan?.status)) {
    return { label: "Plan ready for approval", tone: "attention" };
  }
  if (workspace.status === "READY_FOR_REVIEW") return { label: "Ready for review", tone: "attention" };
  if (workspace.status === "FAILED") {
    const latest = workspace.implementRuns?.at(-1);
    if (latest && (latest.outcome === "COMPLETED" || latest.status === "COMPLETED")) {
      return { label: "Needs recovery", tone: "attention" };
    }
    return { label: "Failed", tone: "attention" };
  }
  if (!plan) return { label: "Planning", tone: "progress" };
  if (plan.status === "APPROVED" && !["ACTIVE", "READY_FOR_REVIEW", "FAILED", "COMPLETED", "ABANDONED"].includes(workspace.status)) {
    return { label: "Plan approved", tone: "progress" };
  }
  return { label: workspace.status, tone: "neutral" };
}

function validationStatus(task: CodingTask): { label: string; tone: StatusTone } {
  const workspace = task.workspace;
  if (!workspace?.plan) return { label: "Not started", tone: "neutral" };
  const evidence = workspace.evidence.filter((item) => item.command);
  if (evidence.length === 0) {
    if (workspace.status === "ACTIVE") return { label: "In progress", tone: "progress" };
    return { label: "Not run", tone: "neutral" };
  }
  const failed = evidence.some((item) => item.result === "FAIL");
  if (failed) return { label: "Checks failed", tone: "attention" };
  const passed = evidence.some((item) => item.result === "PASS");
  if (passed) return { label: "Checks passed", tone: "success" };
  return { label: "Recorded", tone: "neutral" };
}

function approvalStatus(task: CodingTask): { label: string; tone: StatusTone } {
  const workspace = task.workspace;
  if (!workspace) return { label: "Not started", tone: "neutral" };
  if (workspace.status === "COMPLETED" && workspace.headCommit && workspace.headCommit !== workspace.baseCommit) {
    return { label: "Committed", tone: "success" };
  }
  const fresh = workspace.approvals?.find((item) => !item.stale);
  if (planNeedsHumanReview(workspace.plan?.status)) {
    return { label: "Plan awaiting approval", tone: "attention" };
  }
  if (fresh) return { label: "Code approved", tone: "success" };
  if (workspace.status === "READY_FOR_REVIEW") {
    if (workspace.commitOffer) return { label: "Ready to commit", tone: "attention" };
    return { label: "Awaiting human approval", tone: "attention" };
  }
  if (workspace.plan?.status === "APPROVED") return { label: "Plan approved", tone: "progress" };
  return { label: "Not required yet", tone: "neutral" };
}

function verificationStatus(
  task: CodingTask,
  verification: VerificationSnapshot | null,
): { label: string; tone: StatusTone } {
  if (!verification) {
    if (task.status === "COMPLETED" || task.workspace?.status === "COMPLETED") {
      return { label: "Ready for Prove", tone: "attention" };
    }
    return { label: "Not started", tone: "neutral" };
  }
  const verdict = verification.overallVerdict ?? "";
  if (verdict === "PASS" || verdict === "PASSED") return { label: "Verified", tone: "success" };
  if (verdict === "FAIL" || verdict === "FAILED") return { label: "Verification failed", tone: "blocked" };
  if (verification.status === "RUNNING" || verification.status === "ACTIVE") {
    return { label: "Verification running", tone: "progress" };
  }
  if (verification.status === "BLOCKED") return { label: "Verification blocked", tone: "blocked" };
  return { label: verification.status || "In Prove", tone: "progress" };
}

function primaryAction(
  task: CodingTask,
  verify: { label: string; tone: StatusTone },
): PrimaryAction | null {
  const workspace = task.workspace;
  if (task.status === "PROPOSED" || task.status === "BLOCKED") {
    if (task.blockers.length === 0 || task.status === "PROPOSED") {
      return { kind: "approve-task", label: "Approve task for coding" };
    }
  }
  if (workspace?.plan && planNeedsHumanReview(workspace.plan.status)) {
    return { kind: "open-plan", label: "Review and approve execution plan" };
  }
  if (task.canStart) return { kind: "start-coding", label: "Start coding" };
  if (workspace?.status === "READY_FOR_REVIEW") {
    if (workspace.commitOffer) return { kind: "review-code", label: "Commit approved changes" };
    if (workspace.validateExistingOffer && !workspace.recordRepairOffer && workspace.codeReview && !workspace.codeReview.approvable) {
      return { kind: "validate-existing", label: "Validate existing implementation" };
    }
    return { kind: "review-code", label: "Review and approve code" };
  }
  if (workspace?.validateExistingOffer && !workspace.recordRepairOffer) {
    return { kind: "validate-existing", label: "Validate existing implementation" };
  }
  if (
    workspace &&
    (workspace.status === "FAILED" || workspace.stale || workspace.retryOffer || workspace.repairOffer || workspace.recordRepairOffer)
  ) {
    return { kind: "recover-workspace", label: "Resolve coding recovery" };
  }
  if (
    (task.status === "COMPLETED" || workspace?.status === "COMPLETED") &&
    (verify.tone === "attention" || verify.tone === "neutral")
  ) {
    return { kind: "open-prove", label: "Open Prove for verification" };
  }
  return null;
}

function planNeedsHumanReview(status: string | null | undefined) {
  return status === "PROPOSED" || status === "CHANGES_REQUESTED" || status === "ESCALATED";
}

function explainIdle(task: CodingTask, blockers: string[]): string {
  if (blockers.length > 0) return blockers[0]!;
  if (task.status === "COMPLETED") return "Task coding is complete. No Build action is required.";
  if (!task.workspace && task.status === "APPROVED") {
    return "Coding cannot start until readiness blockers are cleared.";
  }
  return "No permitted action is available right now.";
}

function latestCodingOutcome(
  latestRun: { outcome: string; status: string; error: string } | null,
  workspaceStatus: string | null,
): string {
  if (!workspaceStatus) return "No coding run yet";
  if (workspaceStatus === "COMPLETED") return "Coding completed";
  if (workspaceStatus === "READY_FOR_REVIEW") return "Ready for human code review";
  if (workspaceStatus === "ACTIVE") return "Coding in progress";
  if (workspaceStatus === "ABANDONED") return "Workspace abandoned";
  if (!latestRun) return `Workspace ${workspaceStatus}`;
  if (latestRun.error) return `Latest run: ${latestRun.outcome || latestRun.status} — ${latestRun.error}`;
  return `Latest run: ${latestRun.outcome || latestRun.status}`;
}

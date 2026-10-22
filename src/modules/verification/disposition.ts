import { isVerificationFailureClass, RETRYABLE_VERIFICATION_FAILURES } from "@/modules/verification/failure";

export type VerificationProgress =
  | "NONE"
  | "RUNNING"
  | "RETRYABLE"
  | "REVIEW"
  | "AWAITING"
  | "FAILED"
  | "APPROVED"
  | "STALE"
  | "DEMO";

const RUNNING = new Set(["PLANNING", "READY", "EXECUTING"]);

export function verificationProgress(input: {
  session: {
    status: string;
    overallVerdict: string | null;
    failureClass?: string | null;
    demo: boolean;
    stale: boolean;
  } | null;
  approvalStale: boolean;
  approved: boolean;
}): VerificationProgress {
  const session = input.session;
  if (!session) return "NONE";
  if (session.demo) return "DEMO";
  if (session.stale || input.approvalStale) return "STALE";
  if (
    input.approved &&
    (session.overallVerdict === "PASS" || session.overallVerdict === "PASS_WITH_CONCERNS")
  ) {
    return "APPROVED";
  }
  if (RUNNING.has(session.status)) return "RUNNING";
  if (session.overallVerdict === "PASS" || session.overallVerdict === "PASS_WITH_CONCERNS") return "AWAITING";
  if (session.overallVerdict === "FAIL") return "FAILED";
  const failureClass = session.failureClass ?? "";
  if (isVerificationFailureClass(failureClass) && RETRYABLE_VERIFICATION_FAILURES.has(failureClass) && session.overallVerdict !== "INCONCLUSIVE") {
    return "RETRYABLE";
  }
  if (session.overallVerdict === "INCONCLUSIVE") {
    return failureClass === "VERIFICATION_COMMAND_UNAVAILABLE" || failureClass === "VERIFICATION_EVIDENCE_INSUFFICIENT"
      ? "RETRYABLE"
      : "REVIEW";
  }
  if (session.status === "FAILED" || session.status === "BLOCKED") return "RETRYABLE";
  return "REVIEW";
}

export function verificationAction(progress: VerificationProgress) {
  switch (progress) {
    case "NONE":
    case "DEMO":
      return { key: "start-check" as const, label: "Start Independent Verification", decision: false };
    case "RUNNING":
      return { key: "view-verification" as const, label: "View Verification Progress", decision: false };
    case "RETRYABLE":
      return { key: "retry-verification" as const, label: "Retry Independent Verification", decision: false };
    case "REVIEW":
      return { key: "review-verification" as const, label: "Review Verification Result", decision: true };
    case "AWAITING":
      return { key: "approve-verification" as const, label: "Approve Verification", decision: true };
    case "FAILED":
      return { key: "review-verification-findings" as const, label: "Review Findings / Request Changes", decision: true };
    default:
      return null;
  }
}

export type AttemptEvidence = {
  type: string;
  source: string;
  result: string;
};

export type AttemptExecution = {
  command: string;
  status: string;
  outputSummary: string;
};

export function describeVerificationAttempt(input: {
  taskStatus: string;
  commitSha: string;
  session: {
    status: string;
    overallVerdict: string | null;
    failureClass: string;
    verdictReason: string;
    commitSha: string;
    demo?: boolean;
    stale?: boolean;
    executions: AttemptExecution[];
    evidence: AttemptEvidence[];
    approvals: { stale: boolean }[];
  } | null;
}) {
  const session = input.session;
  const commit = shortCommit(session?.commitSha || input.commitSha);
  const implementation = implementationLabel(input.taskStatus);
  if (!session) {
    return {
      implementation,
      commit,
      verification: "Not started",
      reason: "Independent Verification has not started.",
      productVerdict: "Not determined",
      approval: "Not available",
      nextAction: "Start Independent Verification",
    };
  }
  const progress = verificationProgress({
    session: { ...session, demo: session.demo ?? false, stale: session.stale ?? false },
    approvalStale: false,
    approved: session.approvals.some((item) => !item.stale),
  });
  const action = verificationAction(progress);
  return {
    implementation,
    commit,
    verification: verificationLabel(session, progress),
    reason: attemptReason(session),
    productVerdict: session.overallVerdict ?? "Not determined",
    approval: approvalLabel(session),
    nextAction: progress === "APPROVED" ? "Publish Branch" : action?.label ?? "Review Verification Result",
  };
}

export function integratedPlanCopy(recorded: boolean) {
  if (!recorded) {
    return "No integrated plan is recorded. Recording a plan does not execute end-to-end checks or complete product verification.";
  }
  return "Integrated plan recorded. Execution has not started. Slice verification is blocked. This plan does not complete product verification.";
}

function verificationLabel(
  session: { status: string; overallVerdict: string | null },
  progress: VerificationProgress,
) {
  if (progress === "RUNNING") return "Running";
  if (progress === "RETRYABLE") return "Execution failed";
  if (session.overallVerdict === "PASS") return "Passed";
  if (session.overallVerdict === "PASS_WITH_CONCERNS") return "Passed with concerns";
  if (session.overallVerdict === "FAIL") return "Failed";
  if (session.overallVerdict === "INCONCLUSIVE") return "Inconclusive";
  if (session.status === "FAILED" || session.status === "BLOCKED") return "Execution failed";
  return session.status;
}

function approvalLabel(session: { overallVerdict: string | null; approvals: { stale: boolean }[] }) {
  if (session.approvals.some((item) => !item.stale)) return "Approved";
  if (session.overallVerdict === "PASS" || session.overallVerdict === "PASS_WITH_CONCERNS") return "Awaiting approval";
  return "Not available";
}

function attemptReason(session: {
  status: string;
  overallVerdict: string | null;
  failureClass: string;
  verdictReason: string;
  executions: AttemptExecution[];
  evidence: AttemptEvidence[];
}) {
  if (session.overallVerdict && session.verdictReason) return session.verdictReason;
  if (session.failureClass === "AI_PROVIDER_UNAVAILABLE") return "AI provider unavailable";
  if (session.failureClass === "VERIFICATION_SETUP_FAILED") return "Verification setup failed";
  if (session.failureClass === "VERIFICATION_COMMAND_UNAVAILABLE") return "Test command unavailable";
  if (session.failureClass === "VERIFICATION_EXECUTION_FAILED") return "Verification execution failed";
  if (!session.overallVerdict && (session.status === "FAILED" || session.status === "BLOCKED")) {
    const missingCommand = session.executions.some((item) =>
      /missing script|no test specified|command not found|not recognized as an internal or external command/i.test(item.outputSummary),
    );
    const interpreted = session.evidence.some((item) => item.type === "AI_ANALYSIS" || item.source === "AI_ANALYSIS");
    const parts: string[] = [];
    if (missingCommand) parts.push("Test command unavailable");
    if (!interpreted && session.executions.length === 0) parts.push("AI provider unavailable");
    else if (!interpreted) parts.push("AI interpretation failed");
    if (parts.length > 0) return parts.join("; ");
    return "Verification execution failed before a product verdict.";
  }
  return session.verdictReason;
}

function implementationLabel(status: string) {
  if (status === "COMPLETED") return "Completed";
  if (status === "APPROVED") return "Approved";
  if (status === "IN_PROGRESS") return "In progress";
  if (status === "BLOCKED") return "Blocked";
  if (status === "CODE_REVIEW") return "In code review";
  return status;
}

function shortCommit(sha: string) {
  if (!sha) return "No commit";
  return sha.length > 12 ? `${sha.slice(0, 12)}…` : sha;
}

import type { VerificationProgress } from "@/modules/verification/disposition";
import { failureStageLabel, sanitizeFailureDetail } from "@/modules/verification/diagnostics";

/**
 * What the latest Independent Verification attempt means for a person. The four failure-like outcomes
 * are deliberately separate:
 * - execution-failed: the process could not complete (provider, setup, command). No criterion was judged.
 * - checks-failed: the process ran and found failing product behaviour (a FAIL verdict).
 * - evidence-insufficient: the process finished but acceptance criteria lack demonstrating evidence.
 *   This is not a failed criterion and not an execution error; a person decides the next step.
 * - awaiting-review: a passing verdict exists and needs a human decision.
 */
export type ProveOutcomeKind =
  | "running"
  | "interrupted"
  | "snapshot-blocked"
  | "execution-failed"
  | "checks-failed"
  | "evidence-insufficient"
  | "awaiting-review"
  | "approved"
  | "stale";

export type ProveOutcomeTone = "danger" | "warning" | "neutral" | "success";

export type ProveOutcome = {
  kind: ProveOutcomeKind;
  tone: ProveOutcomeTone;
  label: string;
  headline: string;
  message: string;
  /** Human-readable failed stage, or the explicit note that it was not recorded. */
  stage: string;
  /** Stable code for support and audit, for example VERIFICATION_EXECUTION_FAILED. Empty when none applies. */
  failureClass: string;
  /** Redacted technical detail from the failure. Empty when none was recorded. */
  technicalDetail: string;
  occurredAt: Date | null;
  recovery: string;
  testCases: { total: number; ran: number };
  notRun: { title: string; reason: string }[];
};

export type OutcomeSession = {
  status: string;
  overallVerdict: string | null;
  failureClass: string;
  failureStage: string;
  failureDetail: string;
  verdictReason: string;
  staleReason: string;
  completedAt: Date | null;
  updatedAt: Date;
  executions: { status: string }[];
  evidence: { testCaseId: string | null; result: string; description: string; acceptanceCriterionId: string | null }[];
  testCases: { id: string; title: string; status: string }[];
};

const RECOVERY_BY_CLASS: Record<string, string> = {
  AI_PROVIDER_UNAVAILABLE:
    "Check that the AI provider used by the Testing & Verification Agent is reachable and has a valid credential in server configuration. Then use Retry Independent Verification. Retry never happens automatically.",
  VERIFICATION_SETUP_FAILED:
    "Check that the local product repository is available and that an isolated workspace can be created for the approved commit. Then retry. Retry never happens automatically.",
  VERIFICATION_COMMAND_UNAVAILABLE:
    "A required check command is not available in the verification environment. Fix the project's scripts or environment, then retry. Retry never happens automatically.",
  VERIFICATION_TEST_ENVIRONMENT_FAILED:
    "A verification test could not run because of its environment or infrastructure, such as a missing dependency, an unsupported file type, an unavailable database, or a time limit. This is not a product failure. Correct the environment, then use Retry Independent Verification. Retry never happens automatically.",
  VERIFICATION_SNAPSHOT_MISMATCH:
    "The verification did not run against the approved source snapshot, so nothing was judged. A person should confirm the approved commit is unchanged. Then use Retry Independent Verification, which starts from the approved commit. Retry never happens automatically.",
  VERIFICATION_ESCALATION_BLOCKED:
    "An open escalation blocks this verification. Resolve it in Evidence & findings, then use Retry Independent Verification if a new attempt is needed. Retry never happens automatically.",
  VERIFICATION_INTERRUPTED:
    "The attempt stopped before it finished. Use Recover Interrupted Attempt to release what it left behind and mark it failed. Earlier records stay in History. Recovery does not start a new attempt; use Retry Independent Verification afterwards.",
};

const DEFAULT_EXECUTION_RECOVERY =
  "Review the technical detail. If the cause is configuration or environment, correct it, then use Retry Independent Verification. Retry never happens automatically, and earlier attempts stay in History.";

/**
 * Derives the outcome for the latest attempt. Returns null when no attempt exists, or when the attempt is
 * a demo, because there is nothing to explain yet.
 */
export function proveOutcome(progress: VerificationProgress, session: OutcomeSession | null): ProveOutcome | null {
  if (!session || progress === "NONE" || progress === "DEMO") return null;
  const testCases = { total: session.testCases.length, ran: session.testCases.filter((item) => item.status === "PASSED" || item.status === "FAILED").length };
  const notRun = session.evidence
    .filter((item) => item.result === "NOT RUN")
    .map((item) => ({
      title: session.testCases.find((test) => test.id === item.testCaseId)?.title ?? "Verification case",
      reason: item.description,
    }));
  const base = { testCases, notRun, failureClass: "", technicalDetail: "", stage: "", occurredAt: session.completedAt ?? session.updatedAt };

  if (progress === "RUNNING") {
    return {
      ...base,
      kind: "running",
      tone: "neutral",
      label: "Verification running",
      headline: "Verification is running",
      message: "Independent Verification is running against the approved source snapshot. Results appear here when it finishes.",
      recovery: "No action is needed until the run finishes.",
      occurredAt: null,
    };
  }

  if (progress === "INTERRUPTED") {
    return {
      ...base,
      kind: "interrupted",
      tone: "warning",
      label: "Verification interrupted",
      headline: "Verification stopped before it finished",
      message: "No process in this server is running this attempt, so it stopped before it finished. Nothing about the product was judged. Evidence written before the stop is kept.",
      stage: failureStageLabel(session.failureStage) ?? "Not recorded for this attempt",
      failureClass: "",
      technicalDetail: "",
      recovery: RECOVERY_BY_CLASS.VERIFICATION_INTERRUPTED ?? "",
    };
  }

  if (progress === "RETRYABLE") {
    const failureClass = session.failureClass;
    if (failureClass === "VERIFICATION_SNAPSHOT_MISMATCH") {
      return {
        ...base,
        kind: "snapshot-blocked",
        tone: "danger",
        label: "Blocked: approved snapshot changed",
        headline: "Verification blocked: the approved snapshot changed",
        message: "The verification workspace did not match the approved source snapshot, so the product was not judged. This is a blocking error, not a failing test.",
        stage: failureStageLabel(session.failureStage) ?? "Not recorded for this attempt",
        failureClass,
        technicalDetail: sanitizeFailureDetail(session.failureDetail || session.verdictReason || ""),
        recovery: RECOVERY_BY_CLASS.VERIFICATION_SNAPSHOT_MISMATCH ?? "",
      };
    }
    const stage = failureStageLabel(session.failureStage) ?? "Not recorded for this attempt";
    const evidenceCount = session.evidence.length;
    const executionCount = session.executions.length;
    const written = evidenceCount + executionCount > 0
      ? `Before the stop, ${executionCount} technical check record(s) and ${evidenceCount} evidence record(s) were written. Those records do not decide the acceptance criteria.`
      : "No evidence was written before the stop, so no acceptance criterion was judged.";
    // An environment or infrastructure stop is not a product failure. Name it so nobody reads it as one.
    const environmentStop = failureClass === "VERIFICATION_TEST_ENVIRONMENT_FAILED";
    return {
      ...base,
      kind: "execution-failed",
      tone: environmentStop ? "warning" : "danger",
      label: environmentStop ? "Verification tests could not run" : "Verification execution failed",
      headline: environmentStop ? "A verification test could not run in this environment" : "Verification execution failed",
      message: environmentStop
        ? `The product was not judged. A verification test could not run because of its environment or infrastructure, not because of product behaviour. Stage: ${stage}. ${written}`
        : `The verification process stopped before it produced a product verdict. Stage: ${stage}. ${written}`,
      stage,
      failureClass,
      technicalDetail: sanitizeFailureDetail(session.failureDetail || session.verdictReason || ""),
      recovery: RECOVERY_BY_CLASS[failureClass] ?? DEFAULT_EXECUTION_RECOVERY,
    };
  }

  if (progress === "FAILED") {
    return {
      ...base,
      kind: "checks-failed",
      tone: "danger",
      label: "Verification checks failed",
      headline: "Verification found failing behaviour",
      message: sanitizeFailureDetail(session.verdictReason) || "Verification ran and found failing product behaviour.",
      recovery: "Review the findings in Evidence & findings. Use the review controls in Approval to re-run failed tests or request changes. Earlier attempts stay in History.",
    };
  }

  if (progress === "REVIEW" && session.overallVerdict === "INCONCLUSIVE") {
    const ran = testCases.ran;
    return {
      ...base,
      kind: "evidence-insufficient",
      tone: "warning",
      label: "Verification Inconclusive",
      headline: "Verification finished without enough evidence",
      message: `${ran} of ${testCases.total} acceptance test case(s) ran automatically. The product was not judged failing. An acceptance criterion that no executed test demonstrates is reported as not verified, not as failed, and it is not an execution error.`,
      recovery: "Open Execution & results to see why each case did not run. Record manual results for cases a person can run, or request more testing. Do not approve until each criterion has demonstrating evidence.",
    };
  }

  if (progress === "REVIEW" || progress === "AWAITING") {
    return {
      ...base,
      kind: "awaiting-review",
      tone: "neutral",
      label: "Awaiting human review",
      headline: "Verification complete — awaiting human review",
      message: session.overallVerdict
        ? `Verification returned ${session.overallVerdict}. The Verification Agent cannot approve its own work, so a person decides.`
        : "Verification needs a person to decide the next step.",
      recovery: "Review the evidence and findings, then approve or request changes.",
    };
  }

  if (progress === "APPROVED") {
    return {
      ...base,
      kind: "approved",
      tone: "success",
      label: "Human approval recorded",
      headline: "Verified — human approval recorded",
      message: "A person approved the verification result for this snapshot. Publishing is a separate step.",
      recovery: "Evidence stays available below.",
    };
  }

  if (progress === "STALE") {
    return {
      ...base,
      kind: "stale",
      tone: "warning",
      label: "Verification stale",
      headline: "Verification is stale",
      message: session.staleReason || "The earlier verification no longer matches the approved source snapshot.",
      recovery: "Start a new attempt for the current approved snapshot. Earlier attempts stay in History.",
    };
  }

  return null;
}
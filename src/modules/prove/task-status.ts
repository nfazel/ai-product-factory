import type { StatusTone } from "@/modules/build/task-status";
import type { VerificationProgress } from "@/modules/verification/disposition";
import { attemptPolicy, attemptStateFor, NEW_ATTEMPT_LABEL } from "@/modules/verification/attempt-policy";
import { proveOutcome, type ProveOutcome } from "@/modules/prove/outcome";
import type { getProveView } from "@/modules/verification/service";

/**
 * Pure presentation logic for the Prove stage. It reads persisted verification records and the
 * existing eligibility result (`awaiting[].blockers`) and derives labels and next actions from them.
 * It owns no state of its own and never starts, approves, or records verification.
 */

export type ProveView = NonNullable<Awaited<ReturnType<typeof getProveView>>>;
export type ProveAwaitingTask = ProveView["awaiting"][number];
export type ProveSession = ProveView["sessions"][number];

export type ProveBucket = "ready" | "in-progress" | "awaiting-review" | "verified" | "blocked";

export type ProveFilter = "all" | "needs-attention" | "ready" | "in-progress" | "verified" | "blocked";

export const PROVE_FILTERS: { id: ProveFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs-attention", label: "Needs attention" },
  { id: "ready", label: "Ready" },
  { id: "in-progress", label: "In progress" },
  { id: "verified", label: "Verified" },
  { id: "blocked", label: "Blocked" },
];

export type ProveTabId = "overview" | "plan" | "results" | "evidence" | "approval" | "history";

export const PROVE_TABS: { id: ProveTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "plan", label: "Verification plan" },
  { id: "results", label: "Execution & results" },
  { id: "evidence", label: "Evidence & findings" },
  { id: "approval", label: "Approval" },
  { id: "history", label: "History" },
];

/**
 * The single recommended action for a task. Each kind maps to exactly one existing control or link:
 * - start-verification / retry-verification render the existing server-action forms.
 * - workspace-tab links to a tab inside the verification workspace (no state change).
 * - return-to-build links to the Build task, where the blocker is resolved.
 * - recover-verification renders the explicit human recovery form for an interrupted attempt. It never retries.
 * - start-new-verification links to the explicit new-attempt control in the workspace. It never starts an attempt itself.
 */
export type ProveNextAction =
  | { kind: "start-verification"; label: string }
  | { kind: "retry-verification"; label: string }
  | { kind: "start-new-verification"; label: string }
  | { kind: "recover-verification"; label: string; sessionId: string }
  | { kind: "workspace-tab"; label: string; tab: ProveTabId }
  | { kind: "return-to-build"; label: string }
  | { kind: "none"; label: string };

/** Whether a person may start a new attempt now, and why not when it is refused. Decided by the same policy as the server. */
export type NewAttemptState = { allowed: true; reason: "" } | { allowed: false; reason: string };

export type ProveTaskRow = {
  id: string;
  title: string;
  implementationStatus: string;
  implementationLabel: string;
  verificationLabel: string;
  verificationTone: StatusTone;
  progress: VerificationProgress;
  bucket: ProveBucket;
  needsAttention: boolean;
  blockers: string[];
  primaryBlocker: string;
  nextAction: ProveNextAction;
  commitSha: string;
  shortCommit: string;
  lastActivityAt: Date | null;
  sessionId: string | null;
  approved: boolean;
  /** What the latest attempt means for a person. Null when no attempt exists. */
  outcome: ProveOutcome | null;
  /** Whether Start New Verification Attempt is permitted for this task, and the reason when it is not. */
  newAttempt: NewAttemptState;
};

export type ProveOverviewSummary = {
  ready: number;
  inProgress: number;
  awaitingReview: number;
  verified: number;
  blocked: number;
  total: number;
  attention: number;
  rows: ProveTaskRow[];
};

export type ProveStateExplanation = {
  headline: string;
  meaning: string;
  blocker: string;
  why: string;
};

const IMPLEMENTATION_LABEL: Record<string, string> = {
  PROPOSED: "Proposed",
  APPROVED: "Approved",
  IN_PROGRESS: "In progress",
  CODE_REVIEW: "Code review",
  COMPLETED: "Completed",
  BLOCKED: "Blocked",
};

export const BUCKET_LABEL: Record<ProveBucket, string> = {
  ready: "Ready for verification",
  "in-progress": "Verification in progress",
  "awaiting-review": "Awaiting human review",
  verified: "Verified",
  blocked: "Blocked / failed",
};

export function proveTaskHref(productId: string, taskId: string) {
  return `/products/${productId}/testing/tasks/${taskId}`;
}

export function buildTaskHref(productId: string, taskId: string) {
  return `/products/${productId}/build/tasks/${taskId}`;
}

export function proveOverviewSummary(awaiting: ProveAwaitingTask[], sessions: ProveSession[]): ProveOverviewSummary {
  const rows = sortProveRows(awaiting.map((task) => summariseProveTask(task, sessionsForTask(sessions, task.id))));
  return {
    total: rows.length,
    ready: rows.filter((row) => row.bucket === "ready").length,
    inProgress: rows.filter((row) => row.bucket === "in-progress").length,
    awaitingReview: rows.filter((row) => row.bucket === "awaiting-review").length,
    verified: rows.filter((row) => row.bucket === "verified").length,
    blocked: rows.filter((row) => row.bucket === "blocked").length,
    attention: rows.filter((row) => row.needsAttention).length,
    rows,
  };
}

/**
 * Uses the most recent non-demo session for the task. `getProveView` orders sessions newest first,
 * so an earlier failure never overrides a later passing session.
 */
export function currentSessionFor(sessions: ProveSession[]): ProveSession | null {
  return sessions.find((session) => !session.demo) ?? sessions[0] ?? null;
}

export function summariseProveTask(task: ProveAwaitingTask, sessions: ProveSession[]): ProveTaskRow {
  const current = currentSessionFor(sessions);
  const state = attemptStateFor(sessions, { interrupted: current?.interrupted ?? false });
  const progress = state.progress;
  const approved = Boolean(current?.approvals.some((item) => !item.stale));
  const blockers = [...task.blockers];
  const bucket = proveBucket(progress, blockers, task.status);
  const commitSha = task.commitSha || current?.commitSha || "";
  const outcome = proveOutcome(progress, current);
  const newAttempt = newAttemptStateFor(progress, state.humanApproved, blockers);
  // An inconclusive result has one explicit way forward: a new attempt, when the policy permits it.
  const offerNewAttempt = newAttempt.allowed && progress === "REVIEW" && current?.overallVerdict === "INCONCLUSIVE";
  return {
    id: task.id,
    title: task.title,
    implementationStatus: task.status,
    implementationLabel: IMPLEMENTATION_LABEL[task.status] ?? task.status,
    verificationLabel: verificationLabel(bucket, outcome),
    verificationTone: toneFor(bucket),
    progress,
    bucket,
    needsAttention: bucket === "ready" || bucket === "awaiting-review" || bucket === "blocked",
    blockers,
    primaryBlocker: blockers[0] ?? "",
    nextAction: nextActionFor(bucket, progress, blockers, task.status, current?.id ?? null, offerNewAttempt),
    commitSha,
    shortCommit: shortCommit(commitSha),
    lastActivityAt: current ? lastActivityAt(current) : null,
    sessionId: current?.id ?? null,
    approved,
    outcome,
    newAttempt,
  };
}

function newAttemptStateFor(progress: VerificationProgress, humanApproved: boolean, blockers: string[]): NewAttemptState {
  const decision = attemptPolicy({
    kind: "new",
    progress,
    humanApproved,
    openAttempt: progress === "RUNNING" || progress === "INTERRUPTED",
    entryBlockers: blockers,
  });
  return decision.allowed ? { allowed: true, reason: "" } : { allowed: false, reason: decision.reason };
}

/** Attention first, then active work, then finished work. Blocked tasks stay visible in every view. */
export function sortProveRows(rows: ProveTaskRow[]): ProveTaskRow[] {
  const order: Record<ProveBucket, number> = {
    blocked: 0,
    ready: 1,
    "awaiting-review": 2,
    "in-progress": 3,
    verified: 4,
  };
  return [...rows].sort((left, right) => {
    const byBucket = order[left.bucket] - order[right.bucket];
    if (byBucket !== 0) return byBucket;
    return left.title.localeCompare(right.title);
  });
}

export function filterProveRows(rows: ProveTaskRow[], filter: ProveFilter): ProveTaskRow[] {
  switch (filter) {
    case "needs-attention":
      return rows.filter((row) => row.needsAttention);
    case "ready":
      return rows.filter((row) => row.bucket === "ready");
    case "in-progress":
      return rows.filter((row) => row.bucket === "in-progress");
    case "verified":
      return rows.filter((row) => row.bucket === "verified");
    case "blocked":
      return rows.filter((row) => row.bucket === "blocked");
    default:
      return rows;
  }
}

export function parseProveFilter(value: string | undefined, rows: ProveTaskRow[]): ProveFilter {
  const known = PROVE_FILTERS.map((item) => item.id);
  if (value && (known as string[]).includes(value)) return value as ProveFilter;
  return rows.some((row) => row.needsAttention) ? "needs-attention" : "all";
}

export function parseProveTab(value: string | undefined): ProveTabId {
  const known = PROVE_TABS.map((item) => item.id);
  if (value && (known as string[]).includes(value)) return value as ProveTabId;
  return "overview";
}

/** Plain-language explanation of the current state, shown in the workspace action panel. */
export function explainProveState(row: ProveTaskRow): ProveStateExplanation {
  const blocker = row.primaryBlocker;
  if (row.outcome && (row.bucket === "blocked" || row.bucket === "awaiting-review")) {
    return {
      headline: row.outcome.headline,
      meaning: row.outcome.message,
      blocker: "",
      why: row.outcome.recovery,
    };
  }
  switch (row.bucket) {
    case "ready":
      return {
        headline: "Ready for Independent Verification",
        meaning: `The implementation is approved and its required coding checks pass for the approved source snapshot ${row.shortCommit}.`,
        blocker: "",
        why: "Independent Verification checks the approved snapshot before any human approves it. Starting it does not approve or publish anything.",
      };
    case "in-progress":
      return {
        headline: "Verification in progress",
        meaning: "Independent Verification is running against the approved source snapshot.",
        blocker: "",
        why: "Results appear here when the run finishes. No action is needed until then.",
      };
    case "verified":
      return {
        headline: "Verified — human approval recorded",
        meaning: `A person approved the verification result for snapshot ${row.shortCommit}.`,
        blocker: "",
        why: "Evidence stays available below. Publishing is a separate step in Publish.",
      };
    default:
      if (row.implementationStatus !== "COMPLETED") {
        return {
          headline: "Verification blocked",
          meaning: `Implementation is ${row.implementationLabel.toLowerCase()}. Verification needs a completed task.`,
          blocker: row.primaryBlocker || "The implementation task is not completed.",
          why: "Complete the implementation in Build first. Verification starts only from an approved snapshot.",
        };
      }
      return {
        headline: "Verification blocked",
        meaning: "Independent Verification cannot start until the blocker is resolved.",
        blocker,
        why: "Eligibility is checked by the same gate Start Independent Verification uses. Resolve it in Build.",
      };
  }
}

export function coverageRows(session: ProveSession | null) {
  if (!session) return [];
  return session.coverages.map((coverage) => {
    const linkedTests = session.testCases.filter((test) => test.acceptanceCriterionId === coverage.acceptanceCriterionId);
    const testIds = new Set(linkedTests.map((test) => test.id));
    const linkedEvidence = session.evidence.filter((item) =>
      item.acceptanceCriterionId === coverage.acceptanceCriterionId
      || (item.testCaseId != null && testIds.has(item.testCaseId)),
    );
    const gap = coverage.status === "VERIFIED" && linkedEvidence.length === 0
      ? "Recorded as verified, but no linked evidence exists."
      : linkedEvidence.length === 0 && coverage.status !== "NOT_APPLICABLE"
        ? "No linked evidence."
        : "";
    return {
      criterionId: coverage.acceptanceCriterionId,
      criterion: coverage.criterion.description,
      testCases: linkedTests.map((test) => ({
        id: test.id,
        title: test.title,
        status: test.status,
        provenance: test.provenance,
      })),
      verificationLabel: coverageLabel(coverage.status),
      verificationStatus: coverage.status,
      evidenceCount: linkedEvidence.length,
      evidence: linkedEvidence.map((item) => ({ id: item.id, type: item.type, result: item.result, description: item.description })),
      finding: coverage.status === "FAILED" || coverage.status === "BLOCKED" ? coverage.rationale : "",
      gap,
    };
  });
}

export function executionSummary(session: ProveSession | null) {
  const counts = { PASSED: 0, FAILED: 0, BLOCKED: 0, NOT_RUN: 0 };
  for (const item of session?.executions ?? []) {
    if (item.status in counts) counts[item.status as keyof typeof counts] += 1;
  }
  return counts;
}

export function openFindings(session: ProveSession | null) {
  if (!session) return [];
  const defects = session.defectLinks
    .filter((link) => link.workItem.status !== "DONE")
    .map((link) => ({ id: link.id, kind: "Defect", title: link.workItem.title, detail: `${link.workItem.priority} · ${link.workItem.status}` }));
  const escalations = session.escalations
    .filter((item) => item.status === "OPEN")
    .map((item) => ({ id: item.id, kind: "Escalation", title: item.type, detail: item.reason || item.description }));
  return [...defects, ...escalations];
}

export function approvalState(session: ProveSession | null) {
  const completed = Boolean(session?.overallVerdict);
  const passed = session?.overallVerdict === "PASS" || session?.overallVerdict === "PASS_WITH_CONCERNS";
  const humanApproved = Boolean(session?.approvals.some((item) => !item.stale));
  return { completed, passed, humanApproved };
}

export function lastActivityAt(session: ProveSession): Date {
  const times: Date[] = [session.updatedAt, session.createdAt];
  for (const item of session.executions) times.push(item.completedAt ?? item.createdAt);
  for (const item of session.evidence) times.push(item.createdAt);
  for (const item of session.approvals) times.push(item.createdAt);
  return times.reduce((latest, value) => (value.getTime() > latest.getTime() ? value : latest));
}

function sessionsForTask(sessions: ProveSession[], taskId: string) {
  return sessions.filter((session) => session.implementationTaskId === taskId);
}

function proveBucket(progress: VerificationProgress, blockers: string[], taskStatus: string): ProveBucket {
  if (progress === "APPROVED") return "verified";
  if (progress === "RUNNING") return "in-progress";
  if (progress === "INTERRUPTED") return "blocked";
  if (progress === "AWAITING" || progress === "REVIEW") return "awaiting-review";
  if (progress === "FAILED" || progress === "RETRYABLE" || progress === "STALE") return "blocked";
  if (blockers.length > 0 || taskStatus !== "COMPLETED") return "blocked";
  return "ready";
}

function nextActionFor(
  bucket: ProveBucket,
  progress: VerificationProgress,
  blockers: string[],
  taskStatus: string,
  sessionId: string | null,
  offerNewAttempt: boolean,
): ProveNextAction {
  if (progress === "INTERRUPTED" && sessionId) {
    return { kind: "recover-verification", label: "Recover Interrupted Attempt", sessionId };
  }
  if (offerNewAttempt) {
    return { kind: "start-new-verification", label: NEW_ATTEMPT_LABEL };
  }
  switch (bucket) {
    case "ready":
      return { kind: "start-verification", label: "Start Independent Verification" };
    case "in-progress":
      return { kind: "workspace-tab", label: "View verification progress", tab: "results" };
    case "awaiting-review":
      return { kind: "workspace-tab", label: "Review verification evidence", tab: "approval" };
    case "verified":
      return { kind: "workspace-tab", label: "View evidence", tab: "evidence" };
    default:
      if (blockers.length > 0 || taskStatus !== "COMPLETED") {
        return { kind: "return-to-build", label: taskStatus !== "COMPLETED" ? "Complete Build" : "Return to Build" };
      }
      if (progress === "FAILED") return { kind: "workspace-tab", label: "Review findings", tab: "approval" };
      if (progress === "RETRYABLE" || progress === "STALE") {
        return { kind: "retry-verification", label: "Retry Independent Verification" };
      }
      return { kind: "none", label: "No action available" };
  }
}

function verificationLabel(bucket: ProveBucket, outcome: ProveOutcome | null) {
  if ((bucket === "blocked" || bucket === "awaiting-review") && outcome) return outcome.label;
  if (bucket === "blocked") return "Blocked";
  return BUCKET_LABEL[bucket];
}

function coverageLabel(status: string) {
  switch (status) {
    case "VERIFIED":
      return "Verified";
    case "FAILED":
      return "Failed";
    case "BLOCKED":
      return "Blocked";
    case "NOT_APPLICABLE":
      return "Not applicable";
    default:
      return "Not verified";
  }
}

function toneFor(bucket: ProveBucket): StatusTone {
  switch (bucket) {
    case "verified":
      return "success";
    case "in-progress":
      return "progress";
    case "ready":
    case "awaiting-review":
      return "attention";
    default:
      return "blocked";
  }
}

function shortCommit(sha: string) {
  if (!sha) return "No commit";
  return sha.length > 12 ? sha.slice(0, 12) : sha;
}

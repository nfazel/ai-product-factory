import { verificationProgress, type VerificationProgress } from "@/modules/verification/disposition";

/**
 * Which kind of Independent Verification attempt is being requested.
 * - first: the first attempt for a task. Refused once any attempt exists.
 * - retry: a repeat of an attempt that failed for a technical reason (the RETRYABLE progress in disposition.ts).
 * - new: a fresh attempt after an INCONCLUSIVE result or a result awaiting human review, with no approval yet.
 *
 * Every kind refuses an open attempt, a task a person has approved, and an implementation that fails the entry gates.
 * The server applies this policy at every entry point that creates an attempt. The Prove interface uses the same
 * function to decide what to show, so the two cannot disagree. Pure: it reads nothing and changes nothing.
 */
export type AttemptKind = "first" | "retry" | "new";

export type AttemptRefusal =
  | "OPEN_ATTEMPT"
  | "APPROVED"
  | "INELIGIBLE"
  | "PRIOR_ATTEMPT"
  | "NOT_RETRYABLE"
  | "NOT_NEW_ELIGIBLE";

export type AttemptPolicyInput = {
  kind: AttemptKind;
  /** Progress of the latest non-demo attempt for the task. NONE when no attempt exists. */
  progress: VerificationProgress;
  /** True when a person has a current approval on any non-demo attempt for the task. */
  humanApproved: boolean;
  /** True when an attempt is running or stopped without being recovered. */
  openAttempt: boolean;
  /** Reasons from the entry gate. Empty when the implementation and its approved snapshot are eligible. */
  entryBlockers: string[];
};

export type AttemptPolicy = { allowed: true } | { allowed: false; refusal: AttemptRefusal; reason: string };

const NO_PRIOR_ATTEMPT: readonly VerificationProgress[] = ["NONE", "DEMO"];
const TECHNICAL_RETRY: readonly VerificationProgress[] = ["RETRYABLE", "STALE"];
const NEW_ATTEMPT_AFTER: readonly VerificationProgress[] = ["REVIEW", "AWAITING"];

export const NEW_ATTEMPT_LABEL = "Start New Verification Attempt";

export function attemptPolicy(input: AttemptPolicyInput): AttemptPolicy {
  if (input.openAttempt) {
    return refuse(
      "OPEN_ATTEMPT",
      "Independent Verification is already running for this task, or an earlier attempt has not been recovered. Nothing was started.",
    );
  }
  if (input.humanApproved) {
    return refuse(
      "APPROVED",
      "A person already approved verification for this task. A new attempt is refused, and the approval stands.",
    );
  }
  if (input.entryBlockers.length > 0) {
    return refuse("INELIGIBLE", input.entryBlockers.join(" "));
  }
  switch (input.kind) {
    case "first":
      if (!NO_PRIOR_ATTEMPT.includes(input.progress)) {
        return refuse(
          "PRIOR_ATTEMPT",
          "Verification has already run for this task. Use Start New Verification Attempt after an inconclusive result, or Retry Independent Verification after a technical failure.",
        );
      }
      return { allowed: true };
    case "retry":
      if (!TECHNICAL_RETRY.includes(input.progress)) {
        return refuse(
          "NOT_RETRYABLE",
          "Retry is only for an attempt that failed for a technical reason. After an inconclusive result, use Start New Verification Attempt.",
        );
      }
      return { allowed: true };
    case "new":
      if (!NEW_ATTEMPT_AFTER.includes(input.progress)) {
        return refuse(
          "NOT_NEW_ELIGIBLE",
          "A new attempt is offered after an inconclusive result or a result awaiting human review. Nothing else starts a new attempt.",
        );
      }
      return { allowed: true };
  }
}

function refuse(refusal: AttemptRefusal, reason: string): AttemptPolicy {
  return { allowed: false, refusal, reason };
}

/** The attempt facts the policy needs. Prisma session rows and Prove session views both satisfy this shape. */
export type AttemptFacts = {
  demo: boolean;
  status: string;
  overallVerdict: string | null;
  failureClass: string | null;
  stale: boolean;
  approvals: { stale: boolean }[];
};

/**
 * Reads the state the policy needs from a task's attempts, newest first. The latest non-demo attempt sets the
 * progress. A person's approval on any non-demo attempt counts as approval for the task. The server and the Prove
 * interface both call this, so they derive the same progress and approval state from the same records.
 */
export function attemptStateFor(sessions: AttemptFacts[], options: { interrupted: boolean }) {
  const latest = sessions.find((session) => !session.demo) ?? sessions[0] ?? null;
  const approved = Boolean(latest?.approvals.some((item) => !item.stale));
  const approvalStale = Boolean(latest?.approvals.some((item) => item.stale)) && !approved;
  const progress = verificationProgress({
    session: latest
      ? {
          status: latest.status,
          overallVerdict: latest.overallVerdict,
          failureClass: latest.failureClass ?? "",
          demo: latest.demo,
          stale: latest.stale,
        }
      : null,
    approvalStale,
    approved,
    interrupted: options.interrupted,
  });
  const humanApproved = sessions.some((session) => !session.demo && session.approvals.some((item) => !item.stale));
  return { latest, progress, humanApproved };
}

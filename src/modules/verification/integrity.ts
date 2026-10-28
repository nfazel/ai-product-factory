import { DomainError } from "@/modules/shared/errors";
import { hashText } from "@/modules/coding/policy";

export type VerificationEvidenceState = {
  commitSha: string;
  stale: boolean;
  staleReason?: string;
  executions: { id: string; exitCode: number | null; status: string }[];
  coverages: { acceptanceCriterionId: string; status: string }[];
};

export type VerificationApprovalFact = {
  stale: boolean;
  commitSha: string;
  evidenceFingerprint: string;
  approval: { status: string };
};

export function verificationEvidenceFingerprint(session: Pick<VerificationEvidenceState, "executions" | "coverages">) {
  const body = [
    ...session.executions.map((item) => `${item.id}:${item.exitCode}:${item.status}`),
    ...session.coverages.map((item) => `${item.acceptanceCriterionId}:${item.status}`),
  ].sort();
  return hashText(body.join("|"));
}

export function verificationApprovalIsCurrent(
  approval: VerificationApprovalFact,
  session: VerificationEvidenceState,
) {
  return (
    !session.stale &&
    !approval.stale &&
    approval.approval.status === "APPROVED" &&
    approval.commitSha === session.commitSha &&
    approval.evidenceFingerprint === verificationEvidenceFingerprint(session)
  );
}

export function hasHumanApprovedVerification(session: { approvals: VerificationApprovalFact[] }) {
  return session.approvals.some((item) => item.approval.status === "APPROVED");
}

export function assertVerificationEvidenceMutable(
  session: VerificationEvidenceState & { approvals: VerificationApprovalFact[] },
) {
  if (session.stale) {
    throw new DomainError(session.staleReason || "RE-VERIFICATION REQUIRED.");
  }
  if (hasHumanApprovedVerification(session)) {
    throw new DomainError("Verification was approved. Start a new verification attempt to produce more evidence.");
  }
}

export function withCurrentVerificationApprovals<T extends VerificationEvidenceState & { approvals: VerificationApprovalFact[] }>(
  session: T,
) {
  return {
    ...session,
    approvals: session.approvals.map((approval) => ({
      ...approval,
      stale: !verificationApprovalIsCurrent(approval, session),
    })),
  };
}
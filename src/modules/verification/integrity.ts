import {canonicalJson} from '@/modules/coding/external-manifest';
import {bindingFromState} from './runtime-manifest';
import { DomainError } from "@/modules/shared/errors";
import { hashText } from "@/modules/coding/policy";

export type VerificationEvidenceState = {
  runState?: unknown;
  productId?: string;
  implementationTaskId?: string;
  repositoryWorkspaceId?: string | null;
  contract?: unknown;
  workspace?: unknown;
  testCases?: unknown[];
  evidence?: unknown[];
  conditions?: unknown[];
  nfrResults?: unknown[];
  defectLinks?: unknown[];
  escalations?: unknown[];
  fixturePlan?: unknown;
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

export function verificationEvidenceFingerprint(session: Pick<VerificationEvidenceState, "executions" | "coverages"> & Partial<VerificationEvidenceState>) {
  const binding = bindingFromState(session.runState);
  if (binding) {
    const ordered = (value: unknown[] | undefined) => (value ?? []).map(item => canonicalJson(item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'criterion')) : item)).sort();
    return `v2:${hashText(canonicalJson({binding,productId:session.productId,taskId:session.implementationTaskId,workspaceId:session.repositoryWorkspaceId,commitSha:session.commitSha,contract:session.contract,workspace:session.workspace,fixturePlan:session.fixturePlan,executions:ordered(session.executions),coverages:ordered(session.coverages),cases:ordered(session.testCases),evidence:ordered(session.evidence),conditions:ordered(session.conditions),nfrs:ordered(session.nfrResults),defects:ordered(session.defectLinks),escalations:ordered(session.escalations)}))}`;
  }
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
    Boolean(bindingFromState(session.runState)) &&
    approval.evidenceFingerprint.startsWith("v2:") &&
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
/** All consumers must fingerprint the same complete recorded evidence projection. */
export const VERIFICATION_EVIDENCE_INCLUDE = {
 contract:true,workspace:true,conditions:true,testCases:true,coverages:true,executions:true,evidence:true,nfrResults:true,defectLinks:{include:{workItem:true}},escalations:true,approvals:{include:{approval:true}},
} as const;

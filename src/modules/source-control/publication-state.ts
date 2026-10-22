export const PUBLICATION_STATUSES = ["READY", "PUBLISHED", "DIVERGED", "FAILED", "SUPERSEDED"] as const;

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

/** READY is the only non-terminal publication status. PENDING and IN_PROGRESS are not publication statuses. */
const IN_PROGRESS_STATUSES = new Set<PublicationStatus>(["READY"]);

const STATUS_LABEL: Record<PublicationStatus, string> = {
  READY: "In progress",
  PUBLISHED: "Published",
  DIVERGED: "Diverged",
  FAILED: "Failed",
  SUPERSEDED: "Superseded",
};

export type PublicationRecord = {
  id: string;
  status: PublicationStatus;
  demo: boolean;
  localBranch: string;
  remoteBranch: string;
  localCommitSha: string;
  remoteCommitSha: string;
  failureMessage: string;
};

export type PublicationEvidenceRecord = {
  id: string;
  publishedChangeId: string | null;
  type: string;
  description: string;
  result: string;
};

export type PublicationView = {
  latestStatus: PublicationStatus | null;
  latestStatusLabel: string;
  latestError: string;
  inProgress: boolean;
  offerForm: boolean;
  publishedBranch: string;
  remoteCommitSha: string;
  successfulId: string | null;
  evidence: PublicationEvidenceRecord[];
  demo: boolean;
};

export function publicationStatusLabel(status: PublicationStatus) {
  return STATUS_LABEL[status];
}

export function isApprovedPublication(record: PublicationRecord, branch: string, commit: string) {
  return (
    record.status === "PUBLISHED" &&
    !record.demo &&
    branch.length > 0 &&
    commit.length > 0 &&
    record.remoteBranch === branch &&
    record.localCommitSha === commit &&
    record.remoteCommitSha === commit
  );
}

export function approvedPublication<T extends PublicationRecord>(records: T[], branch: string, commit: string) {
  return records.find((record) => isApprovedPublication(record, branch, commit)) ?? null;
}

export function describePublication(input: {
  branch: string;
  commit: string;
  eligible: boolean;
  records: PublicationRecord[];
  evidence?: PublicationEvidenceRecord[];
}): PublicationView {
  const latest = input.records[0] ?? null;
  const successful = approvedPublication(input.records, input.branch, input.commit);
  const inProgress = Boolean(latest && !latest.demo && IN_PROGRESS_STATUSES.has(latest.status));
  const mismatch = Boolean(latest && !latest.demo && latest.status === "PUBLISHED" && !successful);
  return {
    latestStatus: latest?.status ?? null,
    latestStatusLabel: latest ? publicationStatusLabel(latest.status) : "None",
    latestError:
      latest?.failureMessage ||
      (mismatch ? "This publication does not match the approved branch and commit." : ""),
    inProgress,
    offerForm: input.eligible && !inProgress && !successful && !latest?.demo,
    publishedBranch: successful?.remoteBranch ?? "",
    remoteCommitSha: successful?.remoteCommitSha ?? "",
    successfulId: successful?.id ?? null,
    evidence: successful
      ? (input.evidence ?? []).filter(
          (item) =>
            item.publishedChangeId === successful.id &&
            (item.type === "BRANCH_PUBLISHED" || item.type === "REMOTE_COMMIT"),
        )
      : [],
    demo: Boolean(latest?.demo),
  };
}

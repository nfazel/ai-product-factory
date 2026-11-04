/**
 * Where each section of the plan stands, worked out from plain facts so every wording can be tested without a database.
 * A section is Approved when the latest decision on it was an approval, Waiting when something is drafted but not approved,
 * and Not started when nothing exists yet.
 */
export type SectionState = "APPROVED" | "WAITING" | "NOT_STARTED";

export type ApprovalFact = { status: string; approvedBy: string | null; resolvedAt: Date | null } | null;

export function sectionState(input: { exists: boolean; approval: ApprovalFact }): SectionState {
  if (input.approval?.status === "APPROVED") return "APPROVED";
  return input.exists ? "WAITING" : "NOT_STARTED";
}

export const SECTION_STATE_LABEL: Record<SectionState, string> = {
  APPROVED: "Approved",
  WAITING: "Drafted, not approved",
  NOT_STARTED: "Not started",
};

/** One line for the top of the page. */
export function planHeadline(sections: { title: string; state: SectionState }[]) {
  const approved = sections.filter((section) => section.state === "APPROVED").length;
  const total = sections.length;
  if (approved === total) return "The whole plan is approved. Building can start.";
  const next = sections.find((section) => section.state !== "APPROVED");
  const label = next?.state === "NOT_STARTED" ? "has not been started" : "is drafted and waiting for you";
  return `${approved} of ${total} sections are approved. "${next?.title}" ${label}.`;
}

/** Where drafting the features stands. */
export type DraftState = "NEEDS_BRIEF" | "BRIEF_READY" | "READY" | "RUNNING" | "DRAFTED" | "CANDIDATE" | "FAILED";

/** `candidate` means the agent published a definition candidate that has not yet been selected, so it cannot yet be reviewed. */
export function draftState(input: { briefStatus: string | null; briefReadyForReview: boolean; drafted: boolean; candidate?: boolean; running: boolean; failure: string }): DraftState {
  if (input.briefStatus !== "APPROVED") return input.briefStatus && input.briefReadyForReview ? "BRIEF_READY" : "NEEDS_BRIEF";
  if (input.drafted) return "DRAFTED";
  if (input.candidate) return "CANDIDATE";
  if (input.running) return "RUNNING";
  return input.failure ? "FAILED" : "READY";
}

/**
 * Pure offer rules for validating an existing coding workspace without another AI coding run.
 * The service layer runs setup and validation commands from the approved execution plan.
 */

export type ValidateExistingOfferInput = {
  workspaceStatus: string;
  planStatus: string | null | undefined;
  workspacePathExists: boolean;
  stale: boolean;
  planIncomplete: boolean;
  /** Another coding or repair run is already in progress. */
  busy: boolean;
  /**
   * Ready-for-review workspaces may re-run checks after a scope-only plan revision
   * when approval is blocked by stale or missing validation evidence (not out-of-scope files).
   */
  checksNeedRefresh?: boolean;
};

export function validateExistingOffer(input: ValidateExistingOfferInput): boolean {
  if (input.busy) return false;
  if (input.stale) return false;
  if (input.planIncomplete) return false;
  if (!input.workspacePathExists) return false;
  if (input.planStatus !== "APPROVED" && input.planStatus !== "COMPLETED") return false;
  if (input.workspaceStatus === "FAILED") return true;
  if (input.workspaceStatus === "READY_FOR_REVIEW" && input.checksNeedRefresh) return true;
  return false;
}

export const VALIDATE_EXISTING_LABEL = "Validate Existing Implementation";

export const VALIDATE_EXISTING_HELP =
  "Runs the approved setup and validation commands against the current workspace files. Does not call the Coding Agent. If checks pass, the workspace becomes ready for human code review.";

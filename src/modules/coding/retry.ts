import type { CompiledExecutionContract, PlannedCommand } from "@/modules/coding/commands";
import { isProviderFailureCategory } from "@/modules/ai/failures";

export type CodingRetryDecision = {
  offer: boolean;
  reason: string;
};

const RETRYABLE_WORKSPACE = new Set(["FAILED", "ACTIVE", "ABANDONED"]);

const APPROVAL_REQUIRED = "Execution plan approval is required before Coding can start.";
const PLAN_CHANGED = "The execution plan changed after the failed coding run. The previous contract is not retried until the current plan is approved.";
const CONTRACT_CHANGED = "The approved execution contract has changed since the failed coding run. Retry does not start against a different contract.";
const NOT_RETRYABLE = "This coding failure is not retried from the same execution contract.";

function commandIdentity(commands: PlannedCommand[] | undefined) {
  return (commands ?? []).map((item) => ({
    command: item.command,
    kind: item.kind,
    applicability: item.applicability,
  }));
}

export function executionContractIdentity(contract: Partial<CompiledExecutionContract> | null | undefined) {
  if (!contract) return "";
  return JSON.stringify({
    planVersion: contract.planVersion ?? null,
    allowedFiles: contract.allowedFiles ?? [],
    setupCommands: contract.setupCommands ?? [],
    validationCommands: commandIdentity(contract.validationCommands),
    notApplicableChecks: commandIdentity(contract.notApplicableChecks),
    executableCommands: contract.executableCommands ?? [],
  });
}

export function executionContractsMatch(stored: unknown, current: CompiledExecutionContract) {
  if (!stored || typeof stored !== "object") return false;
  const record = stored as Partial<CompiledExecutionContract>;
  if (typeof record.planVersion !== "number") return false;
  return executionContractIdentity(record) === executionContractIdentity(current);
}

export function filesChangedByRun(events: { action: string; allowed: boolean; path: string }[]) {
  const paths = events.flatMap((event) =>
    event.allowed && ["CREATE_FILE", "WRITE_FILE", "DELETE_FILE"].includes(event.action) && event.path
      ? [event.path]
      : [],
  );
  return [...new Set(paths)];
}

export function codingRetryDecision(input: {
  stale: boolean;
  workspaceStatus: string;
  planStatus: string | null;
  approvedAt: string | null;
  contractReady: boolean;
  contractBlocker: string | null;
  runStatus: string | null;
  errorCategory: string | null;
  storedContract: unknown;
  currentContract: CompiledExecutionContract | null;
}): CodingRetryDecision {
  if (input.stale) {
    return { offer: false, reason: "The execution contract needs review before Coding can continue." };
  }
  if (!RETRYABLE_WORKSPACE.has(input.workspaceStatus)) {
    return { offer: false, reason: "Retry or resume a failed or paused coding workspace." };
  }
  if (input.runStatus !== "FAILED" || !isProviderFailureCategory(input.errorCategory)) {
    return { offer: false, reason: NOT_RETRYABLE };
  }
  if (input.planStatus !== "APPROVED") {
    return { offer: false, reason: input.approvedAt ? PLAN_CHANGED : APPROVAL_REQUIRED };
  }
  if (!input.contractReady || !input.currentContract) {
    return {
      offer: false,
      reason: input.contractBlocker || "The execution contract is not valid for another coding run.",
    };
  }
  if (!executionContractsMatch(input.storedContract, input.currentContract)) {
    return { offer: false, reason: CONTRACT_CHANGED };
  }
  return { offer: true, reason: "" };
}

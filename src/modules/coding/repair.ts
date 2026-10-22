export const MAX_VALIDATION_REPAIRS = 2;

export type ValidationFailureRecord = {
  id: string;
  command: string;
  output: string;
  exitCode: number | null;
};

export function validationRepairDecision(input: {
  planStatus: string | null;
  approvedAt: string | null;
  providerFailure: boolean;
  failures: ValidationFailureRecord[];
  repairAttempts: number;
  scopeInsufficient?: boolean;
}) {
  if (input.scopeInsufficient) {
    return { offer: false, reason: "The approved execution plan cannot satisfy a required validation. Revise the execution plan." };
  }
  if (input.providerFailure) {
    return { offer: false, reason: "This run failed before implementation validation." };
  }
  if (input.planStatus !== "APPROVED" || !input.approvedAt) {
    return { offer: false, reason: "Execution plan approval is required before implementation repair can start." };
  }
  if (input.failures.length === 0) {
    return { offer: false, reason: "There is no failed validation command to repair." };
  }
  if (input.repairAttempts >= MAX_VALIDATION_REPAIRS) {
    return {
      offer: false,
      reason: "Implementation repair stopped after the bounded attempts. Review the remaining validation failures.",
    };
  }
  return { offer: true, reason: "" };
}

export function failureRecordKey(id: string) {
  if (!id) throw new Error("Execution evidence has no id.");
  return id;
}

export function requiredValidationCommands(commands: unknown) {
  if (!Array.isArray(commands)) return [];
  return commands.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (!item || typeof item !== "object") return [];
    const record = item as { command?: unknown; applicability?: unknown };
    if (typeof record.command !== "string" || record.applicability === "NOT_APPLICABLE") return [];
    return [record.command];
  });
}

export function commandsAllowedForRepair(requested: string[], approved: string[]) {
  const allowed = new Set(approved);
  return requested.filter((command) => allowed.has(command));
}

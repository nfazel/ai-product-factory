export type CiStateName = "PASSED" | "FAILED" | "PENDING" | "NOT_CONFIGURED" | "UNKNOWN";

export type Access<T> =
  | { access: "readable"; value: T }
  | { access: "forbidden" }
  | { access: "unavailable" };

export type CiCheck = {
  name: string;
  status: string;
  conclusion: string;
  startedAt?: string | null;
  completedAt?: string | null;
  headSha?: string;
  /** GitHub App slug or another source that created the check. */
  app?: string;
  /** Workflow path or name. Attempts of one workflow do not replace another workflow. */
  workflow?: string;
  id?: string;
};

export type CiStatus = {
  context: string;
  state: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  headSha?: string;
};

export type CiObservation = {
  headSha?: string;
  protection: Access<{ requiredChecks: string[] } | null>;
  checks: Access<CiCheck[]>;
  statuses: Access<CiStatus[]>;
  workflows: Access<number>;
};

export type CiAssessment = {
  state: CiStateName;
  detail: string;
  requiredChecks: string[] | null;
};

const PERMISSION = "GitHub App lacks Administration read permission, so branch protection could not be read. That is not evidence that branch protection is absent.";

export function decideCiState(input: CiObservation): CiAssessment {
  const current = withCurrentAttempts(input);
  if (current.protection.access === "forbidden") {
    const observed = observedOutcome(current);
    if (observed === "failure") {
      return { state: "FAILED", detail: `${failedDetail(current)} ${PERMISSION}`, requiredChecks: null };
    }
    if (observed === "pending") {
      return { state: "PENDING", detail: `A check is still running. ${PERMISSION}`, requiredChecks: null };
    }
    return { state: "UNKNOWN", detail: PERMISSION, requiredChecks: null };
  }
  if (current.protection.access === "unavailable" || current.checks.access !== "readable" || current.statuses.access !== "readable") {
    return {
      state: "UNKNOWN",
      detail: "CI requirements or results could not be read from GitHub.",
      requiredChecks: null,
    };
  }
  const required = current.protection.value?.requiredChecks ?? [];
  if (required.length > 0) return assessNamed(required, current.checks.value, current.statuses.value);
  const observed = classifyObserved(current.checks.value, current.statuses.value);
  if (observed === "failure") return { state: "FAILED", detail: failedDetail(current), requiredChecks: [] };
  if (observed === "pending") return { state: "PENDING", detail: "A check is still running.", requiredChecks: [] };
  if (observed === "success") return { state: "PASSED", detail: "Observed checks succeeded. None are recorded as required by branch protection.", requiredChecks: [] };
  if (current.workflows.access !== "readable") {
    return { state: "UNKNOWN", detail: "GitHub Actions workflows could not be read, so the absence of CI is not confirmed.", requiredChecks: [] };
  }
  if (current.workflows.value > 0) {
    return { state: "PENDING", detail: "A GitHub Actions workflow exists and has not reported a result.", requiredChecks: [] };
  }
  return {
    state: "NOT_CONFIGURED",
    detail: "No CI workflows, check runs, or commit statuses are configured. This is not a passing result.",
    requiredChecks: [],
  };
}

export function ciReadinessReason(input: { state: CiStateName; detail: string; requirement: "REQUIRED" | "EXCEPTION" }) {
  if (input.state === "PASSED") return "";
  if (input.state === "NOT_CONFIGURED" && input.requirement === "EXCEPTION") return "";
  if (input.state === "NOT_CONFIGURED") return "CI is required for this product. No CI is configured. That absence is not a pass.";
  return input.detail || "CI status is unknown.";
}

/** The latest attempt for each check identity on the relevant commit. */
export function currentChecks(checks: CiCheck[], headSha?: string) {
  return currentAttempts(forCommit(checks, headSha), checkIdentity);
}

/** The latest commit status for each context on the relevant commit. */
export function currentStatuses(statuses: CiStatus[], headSha?: string) {
  return currentAttempts(
    forCommit(statuses, headSha).map((status) => ({
      ...status,
      startedAt: status.createdAt,
      completedAt: status.updatedAt || status.createdAt,
    })),
    (status) => status.context.trim().toLowerCase(),
  );
}

function withCurrentAttempts(input: CiObservation): CiObservation {
  return {
    ...input,
    checks: input.checks.access === "readable"
      ? { access: "readable", value: currentChecks(input.checks.value, input.headSha) }
      : input.checks,
    statuses: input.statuses.access === "readable"
      ? { access: "readable", value: currentStatuses(input.statuses.value, input.headSha) }
      : input.statuses,
  };
}

function assessNamed(required: string[], checks: CiCheck[], statuses: CiStatus[]): CiAssessment {
  const outcomes = required.map((name) => ({ name, outcome: outcomeFor(name, checks, statuses) }));
  const failed = outcomes.filter((item) => item.outcome === "failure").map((item) => item.name);
  if (failed.length > 0) {
    return { state: "FAILED", detail: `Required check ${failed.join(", ")} did not succeed.`, requiredChecks: required };
  }
  const waiting = outcomes.filter((item) => item.outcome === "pending" || item.outcome === "missing").map((item) => item.name);
  if (waiting.length > 0) {
    return { state: "PENDING", detail: `Required check ${waiting.join(", ")} has not completed.`, requiredChecks: required };
  }
  return { state: "PASSED", detail: "All required checks succeeded.", requiredChecks: required };
}

function observedOutcome(input: CiObservation): "failure" | "pending" | "success" | "none" | "unreadable" {
  if (input.checks.access !== "readable" || input.statuses.access !== "readable") return "unreadable";
  return classifyObserved(input.checks.value, input.statuses.value);
}

function classifyObserved(checks: CiCheck[], statuses: CiStatus[]): "failure" | "pending" | "success" | "none" {
  if (checks.length === 0 && statuses.length === 0) return "none";
  const outcomes = [
    ...checks.map((check) => checkOutcome(check)),
    ...statuses.map((status) => statusOutcome(status.state)),
  ];
  if (outcomes.includes("failure")) return "failure";
  if (outcomes.includes("pending")) return "pending";
  if (outcomes.includes("success")) return "success";
  return "none";
}

function failedDetail(input: CiObservation) {
  if (input.checks.access !== "readable") return "A check did not succeed.";
  const names = [...new Set(input.checks.value.filter((check) => checkOutcome(check) === "failure").map((check) => check.name))];
  return names.length > 0 ? `Check ${names.join(", ")} did not succeed.` : "A check did not succeed.";
}

function outcomeFor(name: string, checks: CiCheck[], statuses: CiStatus[]): "success" | "failure" | "pending" | "missing" {
  const outcomes = [
    ...checks.filter((check) => check.name === name).map((check) => checkOutcome(check)),
    ...statuses.filter((status) => status.context === name).map((status) => statusOutcome(status.state)),
  ];
  if (outcomes.length === 0) return "missing";
  if (outcomes.includes("failure")) return "failure";
  if (outcomes.includes("pending")) return "pending";
  return outcomes.every((outcome) => outcome === "success") ? "success" : "failure";
}

function checkOutcome(check: CiCheck): "success" | "failure" | "pending" {
  if (check.status !== "COMPLETED") return "pending";
  if (check.conclusion === "SUCCESS") return "success";
  return "failure";
}

function statusOutcome(state: string): "success" | "failure" | "pending" {
  if (state === "success") return "success";
  if (state === "pending") return "pending";
  return "failure";
}

function forCommit<T extends { headSha?: string }>(items: T[], headSha?: string) {
  if (!headSha) return items;
  const expected = headSha.toLowerCase();
  return items.filter((item) => !item.headSha || item.headSha.toLowerCase() === expected);
}

function checkIdentity(check: CiCheck) {
  return [check.app ?? "", check.workflow ?? "", check.name].map((part) => part.trim().toLowerCase()).join("\0");
}

function currentAttempts<T extends { startedAt?: string | null; completedAt?: string | null }>(items: T[], identity: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = identity(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  const selected: T[] = [];
  for (const group of groups.values()) {
    if (group.some((item) => attemptTime(item) === null)) {
      selected.push(...group);
      continue;
    }
    const times = group.map((item) => attemptTime(item) ?? 0);
    const latest = Math.max(...times);
    selected.push(...group.filter((_, index) => times[index] === latest));
  }
  return selected;
}

function attemptTime(item: { startedAt?: string | null; completedAt?: string | null }) {
  const raw = item.completedAt || item.startedAt || "";
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? null : time;
}

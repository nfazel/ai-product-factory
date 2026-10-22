import { SAFE_SETUP_COMMANDS } from "@/modules/coding/commands";
import { asStrings } from "@/modules/coding/strings";

export type CodingLifecycle = "NONE" | "READY" | "RUNNING" | "WAITING_FOR_HUMAN" | "FAILED" | "COMPLETED";

export type StepState = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED";

export type CheckState = "NOT_RUN" | "RUNNING" | "PASSED" | "FAILED" | "NOT_APPLICABLE";

export type FailureCategory = "EXECUTION_CONTRACT" | "FILE_PATH" | "VALIDATION" | "SETUP";

export type CodingEvent = {
  id?: string;
  at: string;
  action: string;
  allowed: boolean;
  path: string;
  command: string;
  reason: string;
};

export type CodingCheckEvidence = {
  id: string;
  description: string;
  command: string;
  result: string;
  output?: string;
  exitCode: number | null;
  at: string;
};

export type DiffFile = {
  path: string;
  status: string;
};

export type CodingProgressInput = {
  workspaceStatus: string | null;
  planStatus: string | null;
  planVersion: number | null;
  planApprovedBy: string;
  planSteps: string[];
  requiredChecks: string[];
  agentRunStatus: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | null;
  agentPhase: string | null;
  startedAt: string | null;
  openEscalations: { type: string; description: string; reason: string; recommendedAction: string }[];
  events: CodingEvent[];
  evidence: CodingCheckEvidence[];
  files: DiffFile[];
  currentPlanExecuted?: boolean;
  setupCommands?: string[];
  implementationIncomplete?: boolean;
  implementationGaps?: { path: string }[];
};

export type CodingStepView = {
  index: number;
  text: string;
  state: StepState;
};

export type CodingCheckView = {
  label: string;
  state: CheckState;
  detail: string;
};

export type CodingLogEntry = {
  id: string;
  at: string;
  text: string;
};

const PATH_IN_TEXT = /(?:[\w.-]+\/)*[\w.-]+\.[\w.-]+/g;

export function classifyCodingRun(input: Pick<
  CodingProgressInput,
  "workspaceStatus" | "planStatus" | "agentRunStatus" | "agentPhase" | "openEscalations" | "evidence" | "events"
> & { currentPlanExecuted?: boolean }): CodingLifecycle {
  if (!input.workspaceStatus) return "NONE";
  const implement = input.agentPhase === "implement";
  const failedRun = input.agentRunStatus === "FAILED" || input.agentRunStatus === "CANCELLED";
  const running = !failedRun && (
    (input.agentRunStatus === "RUNNING" && implement)
    || input.planStatus === "EXECUTING"
    || input.workspaceStatus === "CHECKING"
  );
  if (running) return "RUNNING";
  if (input.planStatus === "APPROVED" && input.currentPlanExecuted === false) return "READY";
  if ((input.planStatus === "PROPOSED" || input.planStatus === "CHANGES_REQUESTED") && input.currentPlanExecuted === false) return "NONE";
  const wrote = input.events.some((event) => event.action === "CREATE_FILE" || event.action === "WRITE_FILE" || event.action === "DELETE_FILE");
  const checks = input.evidence.some((item) => item.command || item.result === "FAIL" || item.result === "PASS" || item.result === "NOT RUN");
  const attempted = implement || wrote || checks;
  if (input.workspaceStatus === "FAILED") return "FAILED";
  const recovered = input.workspaceStatus === "READY_FOR_REVIEW" || input.workspaceStatus === "COMPLETED" || input.planStatus === "COMPLETED";
  if (implement && failedRun && !recovered) return "FAILED";
  if (attempted && input.openEscalations.length > 0) return "WAITING_FOR_HUMAN";
  if (attempted && input.evidence.some((item) => item.result === "FAIL" || (item.exitCode != null && item.exitCode !== 0))) {
    if (input.workspaceStatus !== "READY_FOR_REVIEW" && input.workspaceStatus !== "COMPLETED" && input.planStatus !== "COMPLETED") {
      return "FAILED";
    }
  }
  if (input.workspaceStatus === "READY_FOR_REVIEW" || input.workspaceStatus === "COMPLETED" || input.planStatus === "COMPLETED") {
    return "COMPLETED";
  }
  if (input.planStatus === "APPROVED" && !attempted) return "READY";
  if (input.planStatus === "APPROVED" && attempted) return "WAITING_FOR_HUMAN";
  return "NONE";
}

export function describeCodingProgress(input: CodingProgressInput) {
  const lifecycle = classifyCodingRun(input);
  const steps = stepViews(input.planSteps, input.events, lifecycle, input.implementationGaps ?? [], input.evidence);
  const current = steps.find((step) => step.state === "RUNNING")
    ?? steps.find((step) => step.state === "FAILED")
    ?? steps.find((step) => step.state === "PENDING");
  const files = groupFiles(input.files);
  const checks = checkViews(input.requiredChecks, input.evidence, lifecycle);
  return {
    lifecycle,
    steps,
    currentStep: current ?? null,
    files,
    checks,
    log: logEntries(input),
    failures: failureViews(input, steps),
    failureGroups: groupFailures(failureViews(input, steps)),
    synchronous: true,
  };
}

function stepViews(
  steps: string[],
  events: CodingEvent[],
  lifecycle: CodingLifecycle,
  gaps: { path: string }[] = [],
  evidence: CodingCheckEvidence[] = [],
): CodingStepView[] {
  const latestCommand = new Map<string, CodingCheckEvidence>();
  for (const item of evidence) {
    if (item.command) latestCommand.set(item.command, item);
  }
  let blocked = false;
  let markedRunning = false;
  return steps.map((text, index) => {
    const paths = text.match(PATH_IN_TEXT) ?? [];
    const writes = events.filter((event) =>
      (event.action === "CREATE_FILE" || event.action === "WRITE_FILE" || event.action === "DELETE_FILE")
      && paths.some((path) => event.path === path || event.path.endsWith(`/${path}`)),
    );
    const command = ["npm install", "npx prisma generate", "npx prisma validate", "npm run build", "npm test"].find((item) => text.includes(item));
    const check = command ? latestCommand.get(command) : undefined;
    let state: StepState = "PENDING";
    if (gaps.some((gap) => text.includes(gap.path))) state = "FAILED";
    else if (writes.some((event) => !event.allowed)) state = "FAILED";
    else if (writes.some((event) => event.allowed)) state = "COMPLETED";
    else if (check && (check.result === "FAIL" || (check.exitCode != null && check.exitCode !== 0))) state = "FAILED";
    else if (check?.result === "PASS" && (check.exitCode == null || check.exitCode === 0)) state = "COMPLETED";
    else if (blocked) state = "BLOCKED";
    else if (lifecycle === "RUNNING" && !markedRunning) {
      state = "RUNNING";
      markedRunning = true;
    }
    if (state === "FAILED") blocked = true;
    return { index: index + 1, text, state };
  });
}

function groupFiles(files: DiffFile[]) {
  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  for (const file of files) {
    const status = file.status.toLowerCase();
    if (status === "deleted" || status === "removed") deleted.push(file.path);
    else if (status === "modified" || status === "changed") modified.push(file.path);
    else created.push(file.path);
  }
  return { created, modified, deleted };
}

function checkViews(required: string[], evidence: CodingCheckEvidence[], lifecycle: CodingLifecycle): CodingCheckView[] {
  return required.map((label) => {
    const match = evidence.findLast((item) => item.description === label || item.command === label || label.toLowerCase().includes(item.command.toLowerCase()) && item.command.length > 0);
    if (!match) {
      return { label, state: "NOT_RUN" as const, detail: "This check has no saved result." };
    }
    if (match.result === "NOT RUN") {
      return { label, state: "NOT_RUN" as const, detail: match.command ? `${match.command} was not run.` : "This check was not run." };
    }
    if (match.result === "NOT APPLICABLE") {
      return { label, state: "NOT_APPLICABLE" as const, detail: match.description || "This check does not apply to the repository." };
    }
    if (match.result === "FAIL" || (match.exitCode != null && match.exitCode !== 0)) {
      return { label, state: "FAILED" as const, detail: `${match.command || label} exited ${match.exitCode ?? "without a code"}.` };
    }
    if (match.result === "PASS" && (match.exitCode == null || match.exitCode === 0)) {
      return { label, state: "PASSED" as const, detail: match.command ? `${match.command} exited 0.` : "Passed." };
    }
    if (lifecycle === "RUNNING") {
      return { label, state: "RUNNING" as const, detail: "A result has not been saved yet." };
    }
    return { label, state: "NOT_RUN" as const, detail: match.result || "No passing result is saved." };
  });
}

function claimLogId(used: Set<string>, id: string) {
  let next = id;
  let occurrence = 2;
  while (used.has(next)) next = `${id}:${occurrence++}`;
  used.add(next);
  return next;
}

function logEntries(input: CodingProgressInput): CodingLogEntry[] {
  const used = new Set<string>();
  const rows: CodingLogEntry[] = [];
  if (input.planVersion && input.agentPhase === "implement") {
    rows.push({
      id: claimLogId(used, `plan:${input.planVersion}:${input.startedAt ?? ""}`),
      at: input.startedAt ?? "",
      text: `Coding used execution plan version ${input.planVersion}.`,
    });
  }
  for (const event of input.events) {
    const text = eventText(event);
    if (!text) continue;
    const identity = event.id
      ? `event:${event.id}`
      : `event:${event.at}:${event.action}:${event.path}:${event.command}`;
    rows.push({ id: claimLogId(used, identity), at: event.at, text });
  }
  for (const item of input.evidence) {
    if (!item.command && item.result !== "FAIL" && item.result !== "PASS" && item.result !== "NOT RUN") continue;
    const state = item.result === "PASS" ? "passed" : item.result === "FAIL" ? "failed" : item.result === "NOT RUN" ? "was not run" : item.result.toLowerCase();
    rows.push({
      id: claimLogId(used, `evidence:${item.id}`),
      at: item.at,
      text: `${item.description || item.command} ${state}${item.exitCode != null ? ` (exit ${item.exitCode})` : ""}.`,
    });
  }
  return rows.filter((row) => row.text).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

function eventText(event: CodingEvent) {
  if (event.action === "CREATE_FILE" || event.action === "WRITE_FILE" || event.action === "DELETE_FILE") {
    const verb = event.action === "CREATE_FILE" ? "Created" : event.action === "DELETE_FILE" ? "Deleted" : "Modified";
    const refused = event.action === "CREATE_FILE" ? "Create" : event.action === "DELETE_FILE" ? "Delete" : "Modify";
    if (!event.allowed) return `${refused} ${event.path} was refused. ${event.reason}`.trim();
    return `${verb} ${event.path}.`;
  }
  if (event.action === "RUN_COMMAND") {
    if (!event.allowed) return `Refused command ${event.command}. ${event.reason}`.trim();
    return `Ran ${event.command}.`;
  }
  return "";
}

function failureViews(input: CodingProgressInput, steps: CodingStepView[]) {
  const failedStep = steps.find((step) => step.state === "FAILED");
  const rows = [];
  for (const event of input.events) {
    if (event.allowed) continue;
    if (event.action !== "CREATE_FILE" && event.action !== "WRITE_FILE" && event.action !== "DELETE_FILE" && event.action !== "RUN_COMMAND") continue;
    rows.push({
      id: event.id || `${event.at}-${event.action}-${event.path}-${event.command}`,
      what: event.path || event.command || event.action,
      step: failedStep && (event.path && failedStep.text.includes(event.path)) ? `Step ${failedStep.index}` : "Not tied to one plan step",
      message: event.reason || "The action was refused.",
      output: "",
      stopped: event.action !== "RUN_COMMAND",
      category: event.action === "RUN_COMMAND" ? "EXECUTION_CONTRACT" as const : "FILE_PATH" as const,
    });
  }
  for (const item of input.openEscalations) {
    rows.push({
      id: `${item.type}-${item.description}`,
      what: item.type,
      step: failedStep ? `Step ${failedStep.index}` : "Not tied to one plan step",
      message: `${item.description} ${item.recommendedAction}`.trim(),
      output: "",
      stopped: true,
      category: item.type === "POLICY_CONFLICT" ? "EXECUTION_CONTRACT" as const : item.type === "SCOPE_EXPANSION" ? "FILE_PATH" as const : "VALIDATION" as const,
    });
  }
  const setup = new Set(input.setupCommands?.length ? input.setupCommands : SAFE_SETUP_COMMANDS);
  const latestByCommand = new Map<string, CodingCheckEvidence>();
  for (const item of input.evidence) {
    if (item.command) latestByCommand.set(item.command, item);
  }
  for (const item of latestByCommand.values()) {
    if (item.result !== "FAIL" && !(item.exitCode != null && item.exitCode !== 0)) continue;
    const role = item.command && setup.has(item.command) ? "SETUP" as const : "VALIDATION" as const;
    const incomplete = role === "SETUP" && input.implementationIncomplete;
    rows.push({
      id: item.id,
      what: item.description || item.command,
      step: role === "SETUP" ? "Setup" : "Validation",
      message: incomplete
        ? `${item.command} failed${item.exitCode != null ? ` with exit ${item.exitCode}` : ""}. Root cause: implementation incomplete.`
        : `${item.command || item.description} failed${item.exitCode != null ? ` with exit ${item.exitCode}` : ""}.`,
      output: item.output ?? "",
      stopped: true,
      category: role,
    });
  }
  return rows;
}

function groupFailures(failures: { id?: string; category: FailureCategory; what: string; step: string; message: string; output?: string }[]) {
  const labels: Record<FailureCategory, string> = {
    EXECUTION_CONTRACT: "Execution contract",
    FILE_PATH: "File and path",
    VALIDATION: "Validation",
    SETUP: "Setup",
  };
  return (["EXECUTION_CONTRACT", "FILE_PATH", "SETUP", "VALIDATION"] as const).flatMap((category) => {
    const items = failures.filter((failure) => failure.category === category);
    return items.length === 0 ? [] : [{ category, label: labels[category], items }];
  });
}

export function approvedPlanWasExecuted(
  plan: { status: string; version?: number; approvedAt?: Date | string | null } | null,
  run: { startedAt?: Date | string | null; input: unknown } | null,
) {
  if (!plan) return true;
  if (plan.status === "PROPOSED") return false;
  if (!plan.approvedAt || plan.status !== "APPROVED") return true;
  const record = run?.input && typeof run.input === "object" ? run.input as { phase?: unknown; planVersion?: unknown } : null;
  if ((record?.phase === "implement" || record?.phase === "repair") && record.planVersion === plan.version) return true;
  if (!run?.startedAt || (record?.phase !== "implement" && record?.phase !== "repair")) return false;
  return new Date(run.startedAt).getTime() >= new Date(plan.approvedAt).getTime();
}

export function codingRunFromWorkspace(input: {
  status: string;
  plan: { status: string; steps: unknown; version?: number; approvedAt?: Date | string | null } | null;
  escalations: { status: string }[];
  evidence: { result: string; command: string }[];
  agentRun: { status: string; input: unknown; startedAt?: Date | string | null } | null;
}): CodingLifecycle {
  const phase = input.agentRun?.input && typeof input.agentRun.input === "object" && input.agentRun.input && "phase" in input.agentRun.input
    ? String((input.agentRun.input as { phase?: unknown }).phase ?? "")
    : null;
  return classifyCodingRun({
    workspaceStatus: input.status,
    planStatus: input.plan?.status ?? null,
    currentPlanExecuted: approvedPlanWasExecuted(input.plan, input.agentRun),
    agentRunStatus: (input.agentRun?.status ?? null) as CodingProgressInput["agentRunStatus"],
    agentPhase: phase,
    openEscalations: input.escalations.filter((item) => item.status === "OPEN").map(() => ({
      type: "",
      description: "",
      reason: "",
      recommendedAction: "",
    })),
    evidence: input.evidence.map((item) => ({
      id: "",
      description: "",
      command: item.command,
      result: item.result,
      exitCode: item.result === "FAIL" ? 1 : null,
      at: "",
    })),
    events: input.evidence.some((item) => item.result) ? [{ at: "", action: "CREATE_FILE", allowed: true, path: "seen", command: "", reason: "" }] : [],
  });
}

export function planSteps(value: unknown) {
  return asStrings(value);
}

export function snapshotCodingRun(value: CodingLifecycle): "NONE" | "READY" | "RUNNING" | "WAITING" | "FAILED" | "COMPLETED" {
  if (value === "WAITING_FOR_HUMAN") return "WAITING";
  if (value === "NONE") return "NONE";
  return value;
}

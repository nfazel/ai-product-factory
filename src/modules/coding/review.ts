const GENERATED_REVIEW_PATH = /(?:^|\/)(?:node_modules|\.next|\.prisma|src\/generated\/prisma)(?:\/|$)|\.tsbuildinfo$|next-env\.d\.ts$/;

export function isGeneratedReviewPath(filePath: string) {
  return GENERATED_REVIEW_PATH.test(filePath.replaceAll("\\", "/"));
}

export function reviewableDiffFiles(files: unknown) {
  if (!Array.isArray(files)) return [];
  return files.flatMap((file) => {
    if (!file || typeof file !== "object") return [];
    const item = file as { path?: unknown; status?: unknown };
    if (typeof item.path !== "string" || isGeneratedReviewPath(item.path)) return [];
    return [{ path: item.path, status: typeof item.status === "string" ? item.status : "added" }];
  });
}

export const CHECKS_BLOCK_APPROVAL = "Code changes cannot be approved until the required validation checks have passed.";
export const DIFF_UNAVAILABLE = "Code changes are unavailable until the workspace diff is reconciled.";
export const CHECKS_STALE = "Required checks are stale because source files changed after they ran. Approval stays closed until they run against the current source.";
export const OUT_OF_SCOPE_BLOCK = "Code changes include files outside the approved Execution Plan.";
export const PLAN_NOT_APPROVED = "Code changes cannot be approved until the execution plan is approved.";

export type PlanChangeClass = "APPROVED" | "DERIVED" | "GENERATED_IGNORED" | "OUT_OF_SCOPE";

const DELETE_STEP = /\b(?:delete|remove|drop)\b/i;

export function changeVerb(status: string) {
  const value = status.toLowerCase();
  if (value === "deleted" || value === "removed") return "deleted";
  if (value === "modified" || value === "changed") return "modified";
  return "created";
}

export function deletionIsPlanned(filePath: string, steps: string[]) {
  return steps.some((step) => DELETE_STEP.test(step) && step.includes(filePath));
}

function isDerivedChange(filePath: string, status: string, setupCommands: string[]) {
  if (changeVerb(status) === "deleted") return false;
  const install = setupCommands.some((command) => /\bnpm(?:\s+install|\s+ci)\b/.test(command));
  return install && filePath === "package-lock.json";
}

export function classifyPlanChange(input: {
  path: string;
  status: string;
  approvedFiles: string[];
  setupCommands: string[];
  steps: string[];
}): PlanChangeClass {
  if (isGeneratedReviewPath(input.path)) return "GENERATED_IGNORED";
  const verb = changeVerb(input.status);
  const approved = input.approvedFiles.includes(input.path);
  if (verb === "deleted") return approved && deletionIsPlanned(input.path, input.steps) ? "APPROVED" : "OUT_OF_SCOPE";
  if (approved) return "APPROVED";
  if (isDerivedChange(input.path, input.status, input.setupCommands)) return "DERIVED";
  return "OUT_OF_SCOPE";
}

export type ClassifiedChange = {
  path: string;
  status: string;
  verb: "created" | "modified" | "deleted";
  classification: PlanChangeClass;
};

export function classifyPlanDiff(input: {
  files: { path: string; status: string }[];
  approvedFiles: string[];
  setupCommands: string[];
  steps: string[];
}): ClassifiedChange[] {
  return input.files.map((file) => ({
    path: file.path,
    status: file.status,
    verb: changeVerb(file.status),
    classification: classifyPlanChange({ ...input, path: file.path, status: file.status }),
  }));
}

export function executionPlanScopeRevision(input: {
  version: number;
  files: string[];
  steps: string[];
  path: string;
  status: string;
}) {
  const files = input.files.includes(input.path) ? [...input.files] : [...input.files, input.path];
  const planned = deletionIsPlanned(input.path, input.steps);
  const steps = changeVerb(input.status) === "deleted" && !planned ? [...input.steps, `Delete ${input.path}.`] : [...input.steps];
  return {
    version: input.version + 1,
    status: "PROPOSED" as const,
    files,
    steps,
    approvedAt: null,
  };
}

const ROOT_DOCUMENT = /^(?:README|LICENSE|CHANGELOG|CONTRIBUTING)(?:\.[A-Za-z0-9]+)?$/;

export function commandAffectedBy(command: string, filePath: string) {
  const path = filePath.replaceAll("\\", "/");
  if (isGeneratedReviewPath(path)) return false;
  const lower = command.toLowerCase();
  if (/\bprisma\s+(?:validate|generate)\b/.test(lower)) return path === "prisma/schema.prisma" || (path.startsWith("prisma/") && !path.includes("/generated/"));
  if (/\bnpm(?:\s+install|\s+ci)\b/.test(lower)) return path === "package.json" || path === "package-lock.json";
  if (/\bnpm run (?:build|test|lint|typecheck)\b/.test(lower) || /\bnpm test\b/.test(lower)) return isProjectInput(path);
  return !ROOT_DOCUMENT.test(path);
}

function isProjectInput(filePath: string) {
  if (ROOT_DOCUMENT.test(filePath)) return false;
  return filePath === "package.json"
    || filePath === "package-lock.json"
    || filePath.startsWith("src/")
    || filePath.startsWith("app/")
    || filePath.startsWith("prisma/")
    || filePath.startsWith("public/")
    || filePath.startsWith("tsconfig")
    || /^next\.config\./.test(filePath);
}

export type ReviewCommand = {
  command: string;
  result: string;
  exitCode: number | null;
  at: string | Date;
};

export function latestCommandResults(evidence: ReviewCommand[]) {
  const latest = new Map<string, ReviewCommand>();
  const ordered = [...evidence].filter((item) => item.command).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  for (const item of ordered) latest.set(item.command, item);
  return latest;
}

export function commandPassed(item: ReviewCommand | undefined) {
  return Boolean(item && item.result === "PASS" && (item.exitCode == null || item.exitCode === 0));
}

function sourceChangedAfter(input: {
  sourceChangedAt?: Date | null;
  sourceFiles?: { path: string; changedAt: Date }[];
}, command: string, at: string | Date) {
  const checkAt = new Date(at).getTime();
  if (input.sourceFiles) {
    return input.sourceFiles.some((file) => commandAffectedBy(command, file.path) && file.changedAt.getTime() > checkAt);
  }
  return Boolean(input.sourceChangedAt && input.sourceChangedAt.getTime() > checkAt);
}

export function effectiveCommandResults(input: {
  setupCommands: string[];
  validationCommands: { command: string; applicability?: string }[];
  evidence: ReviewCommand[];
  sourceChangedAt?: Date | null;
  sourceFiles?: { path: string; changedAt: Date }[];
}) {
  const latest = latestCommandResults(input.evidence);
  const setup = input.setupCommands.map((command) => {
    const item = latest.get(command);
    return { command, result: item?.result ?? "NOT RUN", passed: commandPassed(item) };
  });
  const required = input.validationCommands.filter((item) => item.applicability !== "NOT_APPLICABLE").map((planned) => {
    const item = latest.get(planned.command);
    const passed = commandPassed(item);
    const stale = Boolean(passed && item && sourceChangedAfter(input, planned.command, item.at));
    return {
      command: planned.command,
      result: stale ? "STALE" : item?.result ?? "NOT RUN",
      passed: passed && !stale,
      stale,
    };
  });
  const notApplicable = input.validationCommands.filter((item) => item.applicability === "NOT_APPLICABLE").map((item) => item.command);
  return {
    setup,
    required,
    notApplicable,
    passed: required.every((item) => item.passed),
    stale: required.some((item) => item.stale),
  };
}

export function codeApprovalDecision(input: {
  sourceFileCount: number;
  checksPassed: boolean;
  checksStale: boolean;
  outOfScope?: { path: string }[];
  planAuthorised?: boolean;
}) {
  if (input.sourceFileCount === 0) return { approvable: false, reason: DIFF_UNAVAILABLE };
  if (input.planAuthorised === false) return { approvable: false, reason: PLAN_NOT_APPROVED };
  if ((input.outOfScope?.length ?? 0) > 0) return { approvable: false, reason: OUT_OF_SCOPE_BLOCK };
  if (input.checksStale) return { approvable: false, reason: CHECKS_STALE };
  if (!input.checksPassed) return { approvable: false, reason: CHECKS_BLOCK_APPROVAL };
  return { approvable: true, reason: "" };
}

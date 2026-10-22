export const CHECK_IDS = [
  "NPM_INSTALL",
  "PRISMA_GENERATE",
  "PRISMA_VALIDATE",
  "BUILD",
  "TYPECHECK",
  "LINT",
  "UNIT_TEST",
] as const;

export type CheckId = (typeof CHECK_IDS)[number];
export type CheckApplicability = "REQUIRED" | "OPTIONAL" | "NOT_APPLICABLE";

type CatalogEntry = {
  id: CheckId;
  kind: "SETUP" | "VALIDATION";
  command: string;
  label: string;
};

const CATALOG: CatalogEntry[] = [
  { id: "NPM_INSTALL", kind: "SETUP", command: "npm install", label: "Install dependencies" },
  { id: "PRISMA_GENERATE", kind: "SETUP", command: "npx prisma generate", label: "Prisma client generation" },
  { id: "PRISMA_VALIDATE", kind: "VALIDATION", command: "npx prisma validate", label: "Prisma schema validation" },
  { id: "BUILD", kind: "VALIDATION", command: "npm run build", label: "Production build" },
  { id: "TYPECHECK", kind: "VALIDATION", command: "npm run typecheck", label: "Typecheck" },
  { id: "LINT", kind: "VALIDATION", command: "npm run lint", label: "Lint" },
  { id: "UNIT_TEST", kind: "VALIDATION", command: "npm test", label: "Unit tests" },
];

const COMMAND_IDS = new Map<string, CheckId>([
  ...CATALOG.map((entry) => [entry.command, entry.id] as const),
  ["npm ci", "NPM_INSTALL"],
  ["npm run test", "UNIT_TEST"],
]);

export type PlanVersionWindow = {
  version: number;
  startedAt: Date;
  endedAt: Date | null;
};

export type PlannedCheckInput = {
  command: string;
  applicability?: string;
  label?: string;
};

export type CheckEvidenceInput = {
  command: string;
  description?: string;
  result: string;
  exitCode: number | null;
  at: Date;
  planVersion?: number | null;
};

export type EffectiveCheck = {
  checkId: CheckId | null;
  command: string;
  label: string;
  applicability: CheckApplicability | "UNKNOWN";
  result: string;
  passed: boolean;
};

const APPLICABILITY = new Set(["REQUIRED", "OPTIONAL", "NOT_APPLICABLE"]);

export function checkIdForCommand(command: string) {
  return COMMAND_IDS.get(normaliseCommand(command)) ?? null;
}

export function checkLabel(id: CheckId) {
  return CATALOG.find((entry) => entry.id === id)?.label ?? id;
}

export function approvedPlanWindows(input: {
  version: number;
  status: string;
  approvedAt: Date | null;
  history: unknown;
}): PlanVersionWindow[] {
  const points: { version: number; startedAt: Date }[] = [];
  if (Array.isArray(input.history)) {
    for (const item of input.history) {
      const point = approvedPoint(item);
      if (point) points.push(point);
    }
  }
  if ((input.status === "APPROVED" || input.status === "COMPLETED") && input.approvedAt) {
    points.push({ version: input.version, startedAt: input.approvedAt });
  }
  points.sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime() || left.version - right.version);
  return points.map((point, index) => ({
    version: point.version,
    startedAt: point.startedAt,
    endedAt: points[index + 1]?.startedAt ?? null,
  }));
}

export function evaluatePlanChecks(input: {
  planVersion: number;
  windows: PlanVersionWindow[];
  checks: PlannedCheckInput[];
  evidence: CheckEvidenceInput[];
}) {
  const applicable = input.evidence.filter((item) => attributedVersion(item, input.windows) === input.planVersion);
  const latest = new Map<CheckId, CheckEvidenceInput>();
  for (const item of [...applicable].sort((left, right) => left.at.getTime() - right.at.getTime())) {
    const id = checkIdForCommand(item.command);
    if (id) latest.set(id, item);
  }
  const evaluated = input.checks.map((check) => effectiveCheck(check, latest));
  const required = evaluated.filter((check) => check.applicability === "REQUIRED");
  const notApplicable = evaluated.filter((check) => check.applicability === "NOT_APPLICABLE");
  return {
    required,
    notApplicable,
    ready: required.length > 0 && required.every((check) => check.passed),
  };
}

export function codeReviewGuidance(input: {
  status: string;
  commitOffer?: boolean;
  headCommit?: string;
  baseCommit?: string;
}) {
  const committed = input.status === "COMPLETED"
    && Boolean(input.headCommit)
    && input.headCommit !== input.baseCommit;
  if (committed) return "Approved source snapshot committed. Ready for Independent Verification.";
  if (input.commitOffer) return "Code changes approved. Create a local commit to lock this approved source snapshot before Independent Verification.";
  if (input.status === "READY_FOR_REVIEW") return "Review the code changes. A later edit makes a code approval stale. Coding checks are not independent verification.";
  if (input.status === "ACTIVE" || input.status === "CHECKING" || input.status === "FAILED" || input.status === "CREATING") {
    return "Code review stays closed until this run is ready for review. An open blocker or a failed check keeps approval closed.";
  }
  return "Coding checks are not independent verification.";
}

function effectiveCheck(check: PlannedCheckInput, latest: Map<CheckId, CheckEvidenceInput>): EffectiveCheck {
  const applicability = APPLICABILITY.has(check.applicability ?? "") ? check.applicability as CheckApplicability : "UNKNOWN";
  const checkId = checkIdForCommand(check.command);
  const evidence = checkId ? latest.get(checkId) : undefined;
  const passed = Boolean(evidence && evidence.result === "PASS" && evidence.exitCode === 0);
  return {
    checkId,
    command: normaliseCommand(check.command),
    label: check.label?.trim() || (checkId ? checkLabel(checkId) : normaliseCommand(check.command)),
    applicability,
    result: applicability === "NOT_APPLICABLE" ? "NOT APPLICABLE" : passed ? "PASS" : evidence?.result ?? "NOT RUN",
    passed: applicability === "REQUIRED" ? passed : false,
  };
}

function attributedVersion(item: CheckEvidenceInput, windows: PlanVersionWindow[]) {
  if (typeof item.planVersion === "number") return item.planVersion;
  const at = item.at.getTime();
  return windows.find((window) => at >= window.startedAt.getTime() && (window.endedAt == null || at < window.endedAt.getTime()))?.version ?? null;
}

function approvedPoint(item: unknown) {
  if (!item || typeof item !== "object") return null;
  const entry = item as { version?: unknown; status?: unknown; approvedAt?: unknown };
  if (entry.status !== "APPROVED" && entry.status !== "COMPLETED") return null;
  if (typeof entry.version !== "number" || typeof entry.approvedAt !== "string") return null;
  const startedAt = new Date(entry.approvedAt);
  if (Number.isNaN(startedAt.getTime())) return null;
  return { version: entry.version, startedAt };
}

function normaliseCommand(command: string) {
  return command.trim().replace(/\s+/g, " ");
}

import fs from "node:fs";
import path from "node:path";

export type ImplementationGapKind = "MISSING_FILE" | "MISSING_PRISMA_MODEL";

export type ImplementationGap = {
  path: string;
  kind: ImplementationGapKind;
  workItem: string;
};

export type CodingFailureClass = "PLAN_INCOMPLETE" | "IMPLEMENTATION_INCOMPLETE" | "IMPLEMENTATION_VALIDATION_FAILED";

const FILE_PATTERN = /(?:^|[\s`'"(])((?:[\w.-]+\/)+[\w.-]+\.(?:tsx|ts|jsx|js|json|prisma|css)|[\w.-]+\.(?:json|prisma))(?![\w])/g;
const DUMMY_MODEL = /^\s*model\s+(Example|Test|Placeholder)\b/m;
const PRISMA_MODEL = /^\s*model\s+[A-Za-z_][A-Za-z0-9_]*\s*\{/m;

export function implementationWorkFiles(steps: string[]) {
  const found: { path: string; workItem: string }[] = [];
  for (const step of steps) {
    if (!/\b(create|initialize|configure)\b/i.test(step)) continue;
    for (const match of step.matchAll(FILE_PATTERN)) {
      found.push({ path: match[1].replaceAll("\\", "/"), workItem: step });
    }
  }
  return found;
}

export function prismaSchemaHasModel(content: string) {
  return PRISMA_MODEL.test(content);
}

export function containsDummyPrismaModel(content: string) {
  return DUMMY_MODEL.test(content);
}

export function assessImplementationCompleteness(input: {
  steps: string[];
  files: { path: string; content: string | null }[];
}) {
  const byPath = new Map(input.files.map((file) => [file.path.replaceAll("\\", "/"), file.content]));
  const gaps: ImplementationGap[] = [];
  for (const item of implementationWorkFiles(input.steps)) {
    const content = byPath.has(item.path) ? byPath.get(item.path) ?? null : null;
    if (content == null) {
      gaps.push({ path: item.path, kind: "MISSING_FILE", workItem: item.workItem });
      continue;
    }
    if (item.path === "prisma/schema.prisma" && /\bmodels?\b/i.test(item.workItem) && !prismaSchemaHasModel(content)) {
      gaps.push({ path: item.path, kind: "MISSING_PRISMA_MODEL", workItem: item.workItem });
    }
  }
  return { complete: gaps.length === 0, gaps };
}

export function readPlannedImplementationFiles(root: string, steps: string[]) {
  return implementationWorkFiles(steps).map((item) => ({
    path: item.path,
    content: readWorkspaceFile(root, item.path),
  }));
}

export function classifyCodingFailure(input: {
  planReady: boolean;
  gaps: ImplementationGap[];
  failedValidation: boolean;
}): CodingFailureClass {
  if (!input.planReady) return "PLAN_INCOMPLETE";
  if (input.gaps.length > 0) return "IMPLEMENTATION_INCOMPLETE";
  if (input.failedValidation) return "IMPLEMENTATION_VALIDATION_FAILED";
  return "IMPLEMENTATION_VALIDATION_FAILED";
}

export function commandsAfterImplementationRepair(input: {
  failed: string[];
  setupCommands: string[];
  validationCommands: string[];
  gaps?: ImplementationGap[];
}) {
  const setup = new Set(input.setupCommands);
  const validation = new Set(input.validationCommands);
  const rerun = input.failed.filter((command) => setup.has(command) || validation.has(command));
  const needsGenerate = (input.gaps ?? []).some((gap) => gap.kind === "MISSING_PRISMA_MODEL");
  if (needsGenerate && setup.has("npx prisma generate") && !rerun.includes("npx prisma generate")) {
    rerun.push("npx prisma generate");
  }
  return {
    rerun,
    continueValidation: input.validationCommands.filter((command) => !rerun.includes(command)),
  };
}

export function repairsForCurrentImplementation<T extends { createdAt?: Date | string | null; input: unknown }>(
  runs: T[],
  workspaceId: string,
  planVersion: number | null,
) {
  const relevant = runs.filter((run) => workspaceIdOf(run.input) === workspaceId);
  const implement = [...relevant].reverse().find((run) => phaseOf(run.input) === "implement") ?? null;
  return relevant.filter((run) => {
    if (phaseOf(run.input) !== "repair") return false;
    const version = planVersionOf(run.input);
    if (planVersion != null && version != null && version !== planVersion) return false;
    if (implement?.createdAt && run.createdAt && new Date(run.createdAt).getTime() <= new Date(implement.createdAt).getTime()) return false;
    return true;
  });
}

export function initialSchemaContext(input: {
  dataApproach?: string;
  entities?: { name: string; description?: string; relationships?: string }[];
}) {
  const lines: string[] = [];
  if (input.dataApproach?.trim()) lines.push(`Approved data approach: ${input.dataApproach.trim()}`);
  for (const entity of input.entities ?? []) {
    const detail = [entity.description?.trim(), entity.relationships?.trim()].filter(Boolean).join(" ");
    lines.push(`Approved data entity: ${entity.name}${detail ? `. ${detail}` : ""}`);
  }
  return {
    named: lines.length > 0,
    text: lines.join("\n"),
  };
}

export function implementationGapText(gap: ImplementationGap) {
  if (gap.kind === "MISSING_FILE") {
    return `Implementation incomplete. The approved work item did not create ${gap.path}. ${gap.workItem}`;
  }
  return `Implementation incomplete. ${gap.workItem} The written schema contains no Prisma model.`;
}

function readWorkspaceFile(root: string, file: string) {
  const absolute = path.resolve(root, file);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  if (!fs.existsSync(/*turbopackIgnore: true*/ absolute)) return null;
  return fs.readFileSync(/*turbopackIgnore: true*/ absolute, "utf8");
}

function workspaceIdOf(input: unknown) {
  const record = input && typeof input === "object" ? input as { workspaceId?: unknown } : null;
  return typeof record?.workspaceId === "string" ? record.workspaceId : null;
}

function phaseOf(input: unknown) {
  const record = input && typeof input === "object" ? input as { phase?: unknown } : null;
  return typeof record?.phase === "string" ? record.phase : null;
}

function planVersionOf(input: unknown) {
  const record = input && typeof input === "object" ? input as { planVersion?: unknown } : null;
  return typeof record?.planVersion === "number" ? record.planVersion : null;
}

import fs from "node:fs";
import path from "node:path";

export type ObligationKind = "FUNCTIONAL_ACCEPTANCE" | "TECHNICAL_COMPLETION" | "PLAN_CHECK" | "ARCHITECTURE" | "NFR";

export type ObligationSource =
  | "EXECUTION_PLAN"
  | "IMPLEMENTATION_TASK"
  | "ARCHITECTURE"
  | "FUNCTIONAL_ACCEPTANCE_CRITERION"
  | "NFR";

export type ObligationStatus = "VERIFIED" | "FAILED" | "NOT_TESTED" | "BLOCKED" | "NOT_APPLICABLE";

export type VerificationObligation = {
  id: string;
  title: string;
  kind: ObligationKind;
  source: ObligationSource;
  mandatory: boolean;
  status: ObligationStatus;
  evidence: string;
};

export type PlanCommand = { command: string; applicability?: string };

export type ObligationInput = {
  plan: {
    version: number;
    status: string;
    files: string[];
    setupCommands: string[];
    validationCommands: PlanCommand[];
  } | null;
  commitSha: string;
  baseCommit: string;
  functionalCriteria: { id: string; description: string; status: ObligationStatus }[];
  parentCriteria: { workItemTitle: string; description: string }[];
  architecture: string;
  nfrs: { id: string; title: string; status: string }[];
  inspection: WorkspaceInspection;
  executions: { command: string; kind: string; status: string }[];
};

export type WorkspaceInspection = {
  readable: boolean;
  presentFiles: string[];
  schemaPresent: boolean;
  schemaModels: string[];
  schemaProvider: string;
};

const APPROVED_PLAN = new Set(["APPROVED", "COMPLETED"]);

export function inspectWorkspace(root: string, files: string[]): WorkspaceInspection {
  if (!root || !fs.existsSync(root)) {
    return { readable: false, presentFiles: [], schemaPresent: false, schemaModels: [], schemaProvider: "" };
  }
  const presentFiles = files.filter((file) => fs.existsSync(path.join(root, file)));
  const schemaPath = path.join(root, "prisma", "schema.prisma");
  if (!fs.existsSync(schemaPath)) {
    return { readable: true, presentFiles, schemaPresent: false, schemaModels: [], schemaProvider: "" };
  }
  const schema = fs.readFileSync(schemaPath, "utf8");
  const schemaModels = [...schema.matchAll(/^model\s+(\w+)/gm)].map((match) => match[1] ?? "").filter(Boolean);
  const provider = schema.match(/provider\s*=\s*"(\w+)"/);
  return { readable: true, presentFiles, schemaPresent: true, schemaModels, schemaProvider: provider?.[1] ?? "" };
}

export function deriveObligations(input: ObligationInput): { obligations: VerificationObligation[]; definitionConcerns: string[] } {
  const obligations: VerificationObligation[] = [];
  const plan = input.plan && APPROVED_PLAN.has(input.plan.status) ? input.plan : null;
  if (plan) {
    obligations.push(bindingObligation(plan, input.commitSha, input.baseCommit));
    obligations.push(...technicalObligations(plan, input.inspection, input.executions));
    obligations.push(...planCheckObligations(plan, input.executions));
  }
  if (input.architecture.trim()) {
    obligations.push(architectureObligation(input.architecture, obligations));
  }
  for (const criterion of input.functionalCriteria) {
    obligations.push({
      id: `criterion:${criterion.id}`,
      title: criterion.description,
      kind: "FUNCTIONAL_ACCEPTANCE",
      source: "FUNCTIONAL_ACCEPTANCE_CRITERION",
      mandatory: criterion.status !== "NOT_APPLICABLE",
      status: criterion.status,
      evidence: "Functional acceptance criterion on this implementation task.",
    });
  }
  for (const nfr of input.nfrs) {
    obligations.push({
      id: `nfr:${nfr.id}`,
      title: nfr.title,
      kind: "NFR",
      source: "NFR",
      mandatory: false,
      status: nfrStatus(nfr.status),
      evidence: "Confirmed non-functional requirement. It does not by itself decide this technical task.",
    });
  }
  for (const execution of input.executions) {
    if (execution.kind !== "EXISTING_REGRESSION") continue;
    const existing = obligations.find((item) => item.id === `check:${execution.command}`);
    if (existing && execution.status === "FAILED") {
      existing.status = "FAILED";
      existing.mandatory = true;
      existing.evidence = "Existing regression tests failed.";
      continue;
    }
    if (existing) continue;
    obligations.push({
      id: `regression:${execution.command}`,
      title: `Existing regression: ${execution.command}`,
      kind: "PLAN_CHECK",
      source: "EXECUTION_PLAN",
      mandatory: execution.status !== "NOT_RUN",
      status: executionStatus(execution.status),
      evidence: "Existing regression command discovered in the repository.",
    });
  }
  return { obligations, definitionConcerns: definitionConcerns(input) };
}

export function definitionConcerns(input: Pick<ObligationInput, "functionalCriteria" | "parentCriteria">) {
  if (input.parentCriteria.length === 0) return [];
  const lines = input.parentCriteria.map((item) => `${item.workItemTitle}: ${item.description}`);
  return [
    `Parent-feature behaviour is not part of this technical task and remains unverified. ${lines.join(" ")}`,
  ];
}

function bindingObligation(plan: NonNullable<ObligationInput["plan"]>, commitSha: string, baseCommit: string) {
  const bound = /^[0-9a-f]{40}$/.test(commitSha) && commitSha === baseCommit;
  return {
    id: "plan-binding",
    title: `Execution Plan v${plan.version} at the approved commit`,
    kind: "TECHNICAL_COMPLETION" as const,
    source: "EXECUTION_PLAN" as const,
    mandatory: true,
    status: bound ? "VERIFIED" as const : "BLOCKED" as const,
    evidence: bound
      ? `Execution Plan v${plan.version} is ${plan.status} and the verification commit matches the approved commit.`
      : "The verification session is not bound to the approved plan commit.",
  };
}

function technicalObligations(
  plan: NonNullable<ObligationInput["plan"]>,
  inspection: WorkspaceInspection,
  executions: ObligationInput["executions"],
): VerificationObligation[] {
  const files = plan.files.map(normalise);
  const items: VerificationObligation[] = [];
  const layout = files.find((file) => /\/layout\.tsx$/.test(file) && file.includes("/app/"));
  const page = files.find((file) => /\/page\.tsx$/.test(file) && file.includes("/app/"));
  if (layout && page) {
    items.push(fileObligation("next-structure", "Approved Next.js application structure", [layout, page], inspection));
  }
  if (files.includes("prisma/schema.prisma")) {
    items.push(schemaObligation(inspection));
  }
  if (files.some((file) => file.endsWith("/db.ts")) || plan.setupCommands.some((command) => command.includes("prisma generate"))) {
    items.push(clientObligation(files, plan.setupCommands, inspection, executions));
  }
  if (files.length > 0) {
    items.push(fileObligation("source-files", "Required source files from the approved Execution Plan", files, inspection));
  }
  return items;
}

function fileObligation(id: string, title: string, files: string[], inspection: WorkspaceInspection): VerificationObligation {
  if (!inspection.readable) {
    return technical(id, title, "NOT_TESTED", "The verification workspace could not be read.");
  }
  const missing = files.filter((file) => !inspection.presentFiles.includes(file));
  if (missing.length > 0) {
    return technical(id, title, "FAILED", `Missing approved file ${missing.join(", ")}.`);
  }
  return technical(id, title, "VERIFIED", `Present: ${files.join(", ")}.`);
}

function schemaObligation(inspection: WorkspaceInspection): VerificationObligation {
  if (!inspection.readable) return technical("prisma-schema", "Approved Prisma schema and initial models", "NOT_TESTED", "The verification workspace could not be read.");
  if (!inspection.schemaPresent) {
    return technical("prisma-schema", "Approved Prisma schema and initial models", "FAILED", "prisma/schema.prisma is not in the workspace.");
  }
  if (inspection.schemaModels.length === 0) {
    return technical("prisma-schema", "Approved Prisma schema and initial models", "FAILED", "The Prisma schema does not declare an initial data model.");
  }
  return technical(
    "prisma-schema",
    "Approved Prisma schema and initial models",
    "VERIFIED",
    `Models: ${inspection.schemaModels.join(", ")}. Provider: ${inspection.schemaProvider || "unspecified"}.`,
  );
}

function clientObligation(
  files: string[],
  setupCommands: string[],
  inspection: WorkspaceInspection,
  executions: ObligationInput["executions"],
): VerificationObligation {
  const clientFile = files.find((file) => file.endsWith("/db.ts"));
  const generate = executions.find((item) => item.command.includes("prisma generate"));
  if (!inspection.readable) return technical("prisma-client", "Prisma client setup", "NOT_TESTED", "The verification workspace could not be read.");
  if (clientFile && !inspection.presentFiles.includes(clientFile)) {
    return technical("prisma-client", "Prisma client setup", "FAILED", `${clientFile} is not in the workspace.`);
  }
  if (generate?.status === "FAILED") return technical("prisma-client", "Prisma client setup", "FAILED", "Prisma client generation failed.");
  if (generate?.status === "BLOCKED") return technical("prisma-client", "Prisma client setup", "BLOCKED", "Prisma client generation could not be executed.");
  if (setupCommands.some((command) => command.includes("prisma generate")) && generate?.status !== "PASSED") {
    return technical("prisma-client", "Prisma client setup", "NOT_TESTED", "Prisma client generation has no passing evidence.");
  }
  return technical("prisma-client", "Prisma client setup", "VERIFIED", clientFile ? `${clientFile} is present.` : "The approved setup generated the Prisma client.");
}

function planCheckObligations(plan: NonNullable<ObligationInput["plan"]>, executions: ObligationInput["executions"]): VerificationObligation[] {
  const commands = [
    ...plan.setupCommands.map((command) => ({ command, applicability: "REQUIRED" })),
    ...plan.validationCommands,
  ];
  return commands.map((command) => {
    const applicability = command.applicability ?? "REQUIRED";
    const execution = executions.find((item) => item.command === command.command);
    if (applicability === "NOT_APPLICABLE") {
      return {
        id: `check:${command.command}`,
        title: command.command,
        kind: "PLAN_CHECK" as const,
        source: "EXECUTION_PLAN" as const,
        mandatory: false,
        status: "NOT_APPLICABLE" as const,
        evidence: "The approved Execution Plan marks this check not applicable.",
      };
    }
    const status = execution ? executionStatus(execution.status) : "NOT_TESTED";
    return {
      id: `check:${command.command}`,
      title: command.command,
      kind: "PLAN_CHECK" as const,
      source: "EXECUTION_PLAN" as const,
      mandatory: applicability !== "OPTIONAL",
      status,
      evidence: execution
        ? `Approved plan check ${execution.status}. A passing command does not by itself verify every technical obligation.`
        : "The approved plan check has no execution evidence.",
    };
  });
}

function architectureObligation(architecture: string, current: VerificationObligation[]): VerificationObligation {
  const relevant = current.filter((item) => item.kind === "TECHNICAL_COMPLETION" && item.id !== "plan-binding");
  const failed = relevant.some((item) => item.status === "FAILED");
  const waiting = relevant.some((item) => item.status === "NOT_TESTED" || item.status === "BLOCKED");
  const aligned = relevant.length > 0 && relevant.every((item) => item.status === "VERIFIED" || item.status === "NOT_APPLICABLE");
  const mentionsStack = /next\.js|prisma|postgresql/i.test(architecture);
  const verified = aligned && mentionsStack && !failed && !waiting;
  return {
    id: "architecture",
    title: "Alignment with the approved architecture",
    kind: "ARCHITECTURE",
    source: "ARCHITECTURE",
    mandatory: mentionsStack,
    status: verified ? "VERIFIED" : "NOT_TESTED",
    evidence: aligned && mentionsStack
      ? "The approved plan files for this task are present. This does not verify parent-feature behaviour."
      : "Architecture alignment is not claimed from command success alone.",
  };
}

function technical(id: string, title: string, status: ObligationStatus, evidence: string): VerificationObligation {
  return { id, title, kind: "TECHNICAL_COMPLETION", source: "EXECUTION_PLAN", mandatory: true, status, evidence };
}

function executionStatus(status: string): ObligationStatus {
  if (status === "PASSED") return "VERIFIED";
  if (status === "FAILED") return "FAILED";
  if (status === "BLOCKED") return "BLOCKED";
  if (status === "NOT_RUN") return "NOT_APPLICABLE";
  return "NOT_TESTED";
}

function nfrStatus(status: string): ObligationStatus {
  if (status === "VERIFIED" || status === "FAILED" || status === "NOT_TESTED" || status === "BLOCKED" || status === "NOT_APPLICABLE") {
    return status;
  }
  return "NOT_TESTED";
}

function normalise(file: string) {
  return file.replaceAll("\\", "/").replace(/^\.\//, "");
}

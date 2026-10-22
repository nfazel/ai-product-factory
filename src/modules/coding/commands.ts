import fs from "node:fs";
import path from "node:path";

import { approveCommand, classifyWrite, filesOutsideContract } from "@/modules/coding/policy";
import { asStrings } from "@/modules/coding/strings";

export const SAFE_SETUP_COMMANDS = ["npm install", "npx prisma generate"] as const;

export const SAFE_VALIDATION_COMMANDS = [
  "npx prisma validate",
  "npm run build",
  "npm run typecheck",
  "npm run lint",
  "npm test",
  "npm run test",
] as const;

export type CommandKind = "SETUP" | "VALIDATION";
export type CommandApplicability = "REQUIRED" | "OPTIONAL" | "NOT_APPLICABLE";

export type PlannedCommand = {
  command: string;
  kind: CommandKind;
  applicability: CommandApplicability;
  reason: string;
};

export type ContractBlocker = {
  step: number | null;
  category: "FILE_PATH" | "EXECUTION_CONTRACT" | "VALIDATION" | "COMPLETENESS";
  message: string;
};

const PRISMA_FILE = /(^|\/)[^/]+\.prisma$/;
const PACKAGE_FILE = /(^|\/)package\.json$/;

export function isCatalogCommand(command: string) {
  return (
    (SAFE_SETUP_COMMANDS as readonly string[]).includes(command) ||
    (SAFE_VALIDATION_COMMANDS as readonly string[]).includes(command)
  );
}

export function deriveExecutionCommands(input: {
  greenfield: boolean;
  filesExpected: string[];
  packageJson: string | null;
  nodeModulesPresent: boolean;
  requiredChecks: string[];
  validationPlan: string;
}): PlannedCommand[] {
  const files = input.filesExpected;
  const interest = `${input.requiredChecks.join("\n")}\n${input.validationPlan}`;
  const pkg = readPackage(input.packageJson);
  const createsPackage = files.some((file) => PACKAGE_FILE.test(toPosix(file)));
  const hasPrisma = files.some((file) => PRISMA_FILE.test(toPosix(file)));
  const commands: PlannedCommand[] = [];
  const needsInstall =
    (createsPackage && (input.greenfield || pkg.hasDependencies || input.packageJson == null)) ||
    (pkg.hasDependencies && !input.nodeModulesPresent && (createsPackage || input.greenfield));
  if (needsInstall) {
    commands.push({
      command: "npm install",
      kind: "SETUP",
      applicability: "REQUIRED",
      reason: "package.json declares dependencies that are not installed in this workspace.",
    });
  }
  if (hasPrisma) {
    commands.push({
      command: "npx prisma generate",
      kind: "SETUP",
      applicability: "REQUIRED",
      reason: "The plan creates a Prisma schema. The Prisma client is generated after that schema exists.",
    });
    commands.push({
      command: "npx prisma validate",
      kind: "VALIDATION",
      applicability: "REQUIRED",
      reason: "The plan creates a Prisma schema, so schema validation is a required check.",
    });
  } else if (/prisma\s+validate/i.test(interest)) {
    commands.push({
      command: "npx prisma validate",
      kind: "VALIDATION",
      applicability: "NOT_APPLICABLE",
      reason: "The plan does not create or change a Prisma schema.",
    });
  }
  pushScriptCheck(commands, {
    requested: /\bbuild\b/i.test(interest),
    command: "npm run build",
    script: pkg.scripts.build,
    createsPackage,
    greenfieldWithoutPackage: input.greenfield && input.packageJson == null,
    presentReason: "package.json defines a build script.",
    missingReason: "package.json has no build script.",
    bootstrapReason: "The plan creates package.json and this task requires a build.",
  });
  const testScript = pkg.scripts.test;
  const usableTest = Boolean(testScript) && !/no test specified/i.test(testScript ?? "");
  if (/\btests?\b/i.test(interest)) {
    commands.push(
      usableTest
        ? {
            command: "npm test",
            kind: "VALIDATION",
            applicability: "REQUIRED",
            reason: "package.json defines a test script.",
          }
        : {
            command: "npm test",
            kind: "VALIDATION",
            applicability: "NOT_APPLICABLE",
            reason: input.packageJson
              ? "package.json has no test script, so unit tests are not a required check for this task."
              : "This bootstrap does not define a unit test script yet, so unit tests are not a required check.",
          },
    );
  }
  pushScriptCheck(commands, {
    requested: /\blint\b/i.test(interest),
    command: "npm run lint",
    script: pkg.scripts.lint,
    createsPackage: false,
    greenfieldWithoutPackage: false,
    presentReason: "package.json defines a lint script.",
    missingReason: "package.json has no lint script.",
    bootstrapReason: "package.json has no lint script.",
  });
  pushScriptCheck(commands, {
    requested: /\btypecheck\b/i.test(interest),
    command: "npm run typecheck",
    script: pkg.scripts.typecheck,
    createsPackage: false,
    greenfieldWithoutPackage: false,
    presentReason: "package.json defines a typecheck script.",
    missingReason: "package.json has no typecheck script.",
    bootstrapReason: "package.json has no typecheck script.",
  });
  return dedupe(commands);
}

export function preflightExecutionPlan(input: {
  files: string[];
  steps: string[];
  allowedPaths: string[];
  restrictedPaths: string[];
  setupCommands: string[];
  validationCommands: PlannedCommand[];
  derived: PlannedCommand[];
}) {
  const blockers: ContractBlocker[] = [];
  for (const file of input.files) {
    const normalised = toPosix(file).replace(/^\.\//, "");
    if (!normalised || normalised.split("/").includes("..") || normalised.startsWith("/")) {
      blockers.push({
        step: stepNumber(input.steps, file),
        category: "FILE_PATH",
        message: approvalMessage(stepNumber(input.steps, file), "a path outside the workspace"),
      });
      continue;
    }
    const write = classifyWrite(normalised, input.allowedPaths, input.restrictedPaths);
    if (!write.ok) {
      const step = stepNumber(input.steps, normalised);
      blockers.push({
        step,
        category: "FILE_PATH",
        message: approvalMessage(step, normalised),
      });
    }
  }
  for (const command of input.derived) {
    if (command.applicability !== "REQUIRED") continue;
    const authorised =
      command.kind === "SETUP"
        ? input.setupCommands.includes(command.command)
        : input.validationCommands.some((item) => item.command === command.command && item.applicability === "REQUIRED");
    if (!authorised) {
      const step = stepNumber(input.steps, command.command) ?? stepNumber(input.steps, subjectOf(command.command));
      blockers.push({
        step,
        category: command.kind === "SETUP" ? "EXECUTION_CONTRACT" : "VALIDATION",
        message: approvalMessage(step, command.command),
      });
    }
  }
  const stored = [
    ...input.setupCommands,
    ...input.validationCommands.filter((item) => item.applicability !== "NOT_APPLICABLE").map((item) => item.command),
  ];
  for (const command of stored) {
    if (!isCatalogCommand(command)) {
      blockers.push({
        step: null,
        category: "EXECUTION_CONTRACT",
        message: `Execution Plan cannot be approved because ${command} is not permitted by the current coding contract.`,
      });
    }
  }
  for (const command of input.derived.filter((item) => item.applicability === "NOT_APPLICABLE")) {
    const forced = input.validationCommands.some((item) => item.command === command.command && item.applicability === "REQUIRED");
    if (forced) {
      blockers.push({
        step: null,
        category: "VALIDATION",
        message: `Execution Plan cannot be approved because ${command.command} is not applicable. ${command.reason}`,
      });
    }
  }
  return { ready: blockers.length === 0, blockers };
}

export function authorisedCommands(commands: PlannedCommand[]) {
  return commands.filter((item) => item.applicability === "REQUIRED" || item.applicability === "OPTIONAL").map((item) => item.command);
}

export function parsePlannedCommands(value: unknown): PlannedCommand[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as { command?: unknown; kind?: unknown; applicability?: unknown; reason?: unknown };
    if (typeof record.command !== "string" || !record.command.trim()) return [];
    const kind = record.kind === "SETUP" || record.kind === "VALIDATION" ? record.kind : "VALIDATION";
    const applicability =
      record.applicability === "REQUIRED" || record.applicability === "OPTIONAL" || record.applicability === "NOT_APPLICABLE"
        ? record.applicability
        : "REQUIRED";
    return [{
      command: record.command.trim().replace(/\s+/g, " "),
      kind,
      applicability,
      reason: typeof record.reason === "string" ? record.reason : "",
    }];
  });
}

export function executionCommandsForPlan(derived: PlannedCommand[]) {
  return {
    setupCommands: derived.filter((item) => item.kind === "SETUP" && item.applicability === "REQUIRED").map((item) => item.command),
    validationCommands: derived.filter((item) => item.kind === "VALIDATION"),
  };
}

export function validationPlanText(commands: PlannedCommand[], current: string) {
  const required = commands.filter((item) => item.applicability === "REQUIRED").map((item) => item.command);
  const skipped = commands.filter((item) => item.applicability === "NOT_APPLICABLE");
  const lines = [
    required.length ? `Run ${required.join(", then ")}.` : current,
    ...skipped.map((item) => `${item.command}: NOT APPLICABLE. ${item.reason}`),
  ];
  return lines.filter(Boolean).join(" ");
}

export function stepsWithCommands(steps: string[], commands: PlannedCommand[]) {
  const next = [...steps];
  for (const command of commands.filter((item) => item.applicability === "REQUIRED")) {
    if (next.some((step) => step.includes(command.command))) continue;
    if (command.command === "npm install") next.push("Install dependencies from package.json with npm install.");
    if (command.command === "npx prisma generate") next.push("Generate the Prisma client with npx prisma generate.");
    if (command.command === "npx prisma validate") next.push("Validate the Prisma schema with npx prisma validate.");
    if (command.command === "npm run build") next.push("Run the Next.js production build with npm run build.");
  }
  return next;
}

export function inspectWorkspacePackage(workspacePath: string) {
  let packageJson: string | null = null;
  try {
    packageJson = fs.readFileSync(path.join(workspacePath, "package.json"), "utf8");
  } catch {
    packageJson = null;
  }
  return {
    packageJson,
    nodeModulesPresent: fs.existsSync(path.join(workspacePath, "node_modules")),
  };
}

export type CompiledExecutionContract = {
  planVersion: number;
  allowedFiles: string[];
  setupCommands: string[];
  validationCommands: PlannedCommand[];
  notApplicableChecks: PlannedCommand[];
  executableCommands: string[];
};

export function compileExecutionContract(input: {
  planVersion: number;
  files: unknown;
  allowedPaths: unknown;
  restrictedPaths: unknown;
  setupCommands: unknown;
  validationCommands: unknown;
}) {
  const allowedFiles = asStrings(input.files);
  const allowedPaths = asStrings(input.allowedPaths);
  const restrictedPaths = asStrings(input.restrictedPaths);
  const validation = parsePlannedCommands(input.validationCommands);
  const setupCommands = asStrings(input.setupCommands);
  const validationCommands = validation.filter((item) => item.applicability === "REQUIRED" || item.applicability === "OPTIONAL");
  const notApplicableChecks = validation.filter((item) => item.applicability === "NOT_APPLICABLE");
  const executableCommands = [...setupCommands, ...validationCommands.map((item) => item.command)];
  const blockers: ContractBlocker[] = [];
  for (const file of filesOutsideContract(allowedFiles, allowedPaths, restrictedPaths)) {
    blockers.push({
      step: null,
      category: "FILE_PATH",
      message: `${file} is outside the approved coding paths.`,
    });
  }
  for (const command of executableCommands) {
    const decision = approveCommand(command, executableCommands);
    if (!decision.ok) {
      blockers.push({
        step: null,
        category: "EXECUTION_CONTRACT",
        message: decision.reason,
      });
    }
  }
  for (const skipped of notApplicableChecks) {
    if (executableCommands.includes(skipped.command)) {
      blockers.push({
        step: null,
        category: "VALIDATION",
        message: `${skipped.command} is not applicable and must not be executed.`,
      });
    }
  }
  const contract: CompiledExecutionContract = {
    planVersion: input.planVersion,
    allowedFiles,
    setupCommands,
    validationCommands,
    notApplicableChecks,
    executableCommands,
  };
  return { contract, ready: blockers.length === 0, blockers };
}

export function assessExecutionContract(input: {
  greenfield: boolean;
  workspacePath: string;
  files: unknown;
  steps: unknown;
  allowedPaths: unknown;
  restrictedPaths: unknown;
  requiredChecks: unknown;
  validationPlan: string;
  setupCommands: unknown;
  validationCommands: unknown;
}) {
  const inspected = input.workspacePath ? inspectWorkspacePackage(input.workspacePath) : { packageJson: null, nodeModulesPresent: false };
  const derived = deriveExecutionCommands({
    greenfield: input.greenfield,
    filesExpected: asStrings(input.files),
    packageJson: inspected.packageJson,
    nodeModulesPresent: inspected.nodeModulesPresent,
    requiredChecks: asStrings(input.requiredChecks),
    validationPlan: input.validationPlan,
  });
  return {
    derived,
    ...preflightExecutionPlan({
      files: asStrings(input.files),
      steps: asStrings(input.steps),
      allowedPaths: asStrings(input.allowedPaths),
      restrictedPaths: asStrings(input.restrictedPaths),
      setupCommands: asStrings(input.setupCommands),
      validationCommands: parsePlannedCommands(input.validationCommands),
      derived,
    }),
  };
}

function pushScriptCheck(
  commands: PlannedCommand[],
  input: {
    requested: boolean;
    command: string;
    script: string | undefined;
    createsPackage: boolean;
    greenfieldWithoutPackage: boolean;
    presentReason: string;
    missingReason: string;
    bootstrapReason: string;
  },
) {
  if (!input.requested) return;
  if (input.script || input.createsPackage || input.greenfieldWithoutPackage) {
    commands.push({
      command: input.command,
      kind: "VALIDATION",
      applicability: "REQUIRED",
      reason: input.script ? input.presentReason : input.bootstrapReason,
    });
    return;
  }
  commands.push({
    command: input.command,
    kind: "VALIDATION",
    applicability: "NOT_APPLICABLE",
    reason: input.missingReason,
  });
}

function readPackage(text: string | null) {
  if (!text) return { scripts: {} as Record<string, string>, hasDependencies: false };
  try {
    const parsed = JSON.parse(text) as { scripts?: unknown; dependencies?: unknown; devDependencies?: unknown };
    const scripts: Record<string, string> = {};
    if (parsed.scripts && typeof parsed.scripts === "object") {
      for (const [key, value] of Object.entries(parsed.scripts)) {
        if (typeof value === "string") scripts[key] = value;
      }
    }
    const hasDependencies =
      hasKeys(parsed.dependencies) || hasKeys(parsed.devDependencies);
    return { scripts, hasDependencies };
  } catch {
    return { scripts: {} as Record<string, string>, hasDependencies: false };
  }
}

function hasKeys(value: unknown) {
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

function dedupe(commands: PlannedCommand[]) {
  const byCommand = new Map<string, PlannedCommand>();
  for (const command of commands) {
    const existing = byCommand.get(command.command);
    if (!existing || (existing.applicability !== "REQUIRED" && command.applicability === "REQUIRED")) {
      byCommand.set(command.command, command);
    }
  }
  return [...byCommand.values()];
}

function stepNumber(steps: string[], needle: string) {
  const index = steps.findIndex((step) => step.toLowerCase().includes(needle.toLowerCase()));
  return index >= 0 ? index + 1 : null;
}

function subjectOf(command: string) {
  if (command.includes("prisma")) return "prisma/schema.prisma";
  if (command === "npm install") return "package.json";
  return command;
}

function approvalMessage(step: number | null, operation: string) {
  const where = step ? `Step ${step} requires ${operation}` : `${operation} is required`;
  return `Execution Plan cannot be approved because ${where}, which is not permitted by the current coding contract.`;
}

function toPosix(value: string) {
  return value.replaceAll("\\", "/");
}

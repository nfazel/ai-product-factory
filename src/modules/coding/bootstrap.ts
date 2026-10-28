import fs from "node:fs";
import path from "node:path";

import { isCatalogCommand, type ContractBlocker } from "@/modules/coding/commands";

export const PRISMA_VALIDATE_PLACEHOLDER = "postgresql://127.0.0.1:5432/coding_validation";

export const NEXT_ENTRY_CANDIDATES = [
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "app/layout.tsx",
  "app/page.tsx",
  "src/pages/index.tsx",
  "pages/index.tsx",
] as const;

export type DesignFacts = {
  architectureSummary: string;
  frontendApproach: string;
  backendApproach: string;
  technologyChoices: string[];
  taskTitle: string;
  taskObjective: string;
  taskDescription: string;
  taskGuidance: string;
  filesLikely: string;
  validation: string;
};

export type ValidationEnvironment = {
  command: string;
  note: string;
};

export type BootstrapAssessment = {
  ready: boolean;
  router: "app" | "pages" | null;
  routerRoot: string | null;
  requiredFiles: string[];
  missingFiles: string[];
  environment: ValidationEnvironment[];
  blockers: ContractBlocker[];
};

const EMPTY_DESIGN: DesignFacts = {
  architectureSummary: "",
  frontendApproach: "",
  backendApproach: "",
  technologyChoices: [],
  taskTitle: "",
  taskObjective: "",
  taskDescription: "",
  taskGuidance: "",
  filesLikely: "",
  validation: "",
};

export function designFactsFromSources(input: {
  architecture: {
    summary: string;
    frontendApproach: string;
    backendApproach: string;
    technologies?: { choice: string }[];
  } | null;
  task: {
    title: string;
    objective: string;
    description: string;
    guidance: string;
    filesLikely: string;
    validation: string;
  } | null;
  fallbackSummary?: string;
}): DesignFacts {
  return {
    architectureSummary: input.architecture?.summary || input.fallbackSummary || "",
    frontendApproach: input.architecture?.frontendApproach ?? "",
    backendApproach: input.architecture?.backendApproach ?? "",
    technologyChoices: input.architecture?.technologies?.map((item) => item.choice) ?? [],
    taskTitle: input.task?.title ?? "",
    taskObjective: input.task?.objective ?? "",
    taskDescription: input.task?.description ?? "",
    taskGuidance: input.task?.guidance ?? "",
    filesLikely: input.task?.filesLikely ?? "",
    validation: input.task?.validation ?? "",
  };
}

export function assessBootstrapCompleteness(input: {
  files: string[];
  steps?: string[];
  validationCommands: { command: string; applicability?: string }[];
  validationPlan?: string;
  design?: Partial<DesignFacts>;
  greenfield?: boolean;
  existingFiles?: string[];
  verificationSummary?: string;
}): BootstrapAssessment {
  const design = { ...EMPTY_DESIGN, ...input.design };
  const corpus = designCorpus(design);
  const files = new Set([...input.files, ...(input.existingFiles ?? [])].map(normalise));
  const requiredCommands = input.validationCommands
    .filter((item) => item.applicability !== "NOT_APPLICABLE")
    .map((item) => item.command);
  const environment = requiredCommands.includes("npx prisma validate")
    ? [{
        command: "npx prisma validate",
        note: "Validation environment: DATABASE_URL is supplied as a non-secret placeholder for this process only. It is not written to the product and it is not the Builder database URL.",
      }]
    : [];
  const nextBuild = requiredCommands.includes("npm run build") && mentionsNext(corpus);
  const bootstrap = isApplicationBootstrap(design, input.files, input.greenfield === true);
  const finish = (result: BootstrapAssessment): BootstrapAssessment => {
    if (!input.steps) return result;
    const consistency = assessPlanConsistency({
      files: input.files,
      steps: input.steps,
      validationCommands: input.validationCommands,
      validationPlan: input.validationPlan ?? "",
      verificationSummary: input.verificationSummary,
    });
    return {
      ...result,
      ready: result.ready && consistency.ready,
      blockers: [...result.blockers, ...consistency.blockers],
    };
  };
  if (!nextBuild || !bootstrap) {
    return finish({ ready: true, router: null, routerRoot: null, requiredFiles: [], missingFiles: [], environment, blockers: [] });
  }
  const router = detectRouter(corpus, input.files);
  if (!router) {
    const message = "Execution Plan cannot be approved because it initialises a Next.js application whose required validation is npm run build, and the approved design does not specify App Router or Pages Router. Revise the execution plan after the design names the router.";
    return finish({
      ready: false,
      router: null,
      routerRoot: null,
      requiredFiles: [],
      missingFiles: [],
      environment,
      blockers: [{ step: null, category: "COMPLETENESS", message }],
    });
  }
  const routerRoot = router === "app" ? appRouterRoot(corpus, input.files) : pagesRouterRoot(corpus, input.files);
  const requiredFiles = router === "app"
    ? [`${routerRoot}/layout.tsx`, `${routerRoot}/page.tsx`]
    : [`${routerRoot}/index.tsx`];
  const missingFiles = requiredFiles.filter((file) => !files.has(file));
  if (missingFiles.length === 0) {
    return finish({ ready: true, router, routerRoot, requiredFiles, missingFiles: [], environment, blockers: [] });
  }
  const message = `Execution Plan cannot be approved because it initialises a Next.js application but contains no approved application entry point. Required validation npm run build cannot succeed. Revise the execution plan to include ${missingFiles.join(", ")}.`;
  return finish({
    ready: false,
    router,
    routerRoot,
    requiredFiles,
    missingFiles,
    environment,
    blockers: [{ step: null, category: "COMPLETENESS", message }],
  });
}

export function planningBootstrapNote(assessment: BootstrapAssessment) {
  if (assessment.ready || assessment.missingFiles.length === 0) return "";
  const router = assessment.router === "pages" ? "Pages Router" : "App Router";
  return [
    `Approved design: Next.js ${router} under ${assessment.routerRoot}.`,
    "This task initialises the application and npm run build is a required validation.",
    `The execution plan must include a work item that creates each of these files: ${assessment.missingFiles.join(", ")}.`,
    "Putting a file in the approved scope does not instruct the Coding Agent to create it.",
    "Do not choose a different router and do not add application functionality beyond this bootstrap.",
  ].join(" ");
}

export function validationProcessEnvironment(command: string, builderDatabaseUrl?: string, workspacePath?: string) {
  const env: Record<string, string> = {};
  const notes: string[] = [];
  const normalized = command.trim().replace(/\s+/g, " ");
  if (isSchemaValidationCommand(normalized) && schemaValidationNeedsPlaceholder(workspacePath)) {
    env.DATABASE_URL = PRISMA_VALIDATE_PLACEHOLDER;
    notes.push(
      "Validation environment: DATABASE_URL was supplied as a non-secret placeholder for schema validation only. It was not written to the product and it is not used for database connectivity.",
    );
  }
  if (isProductionBuildCommand(normalized, workspacePath)) {
    env.NODE_ENV = "production";
    notes.push("Validation environment: NODE_ENV=production for this production build process only.");
  }
  if (builderDatabaseUrl && Object.values(env).includes(builderDatabaseUrl)) {
    if (env.DATABASE_URL === builderDatabaseUrl) env.DATABASE_URL = PRISMA_VALIDATE_PLACEHOLDER;
  }
  return { env, note: notes.join(" ") };
}

export function commandFailureIsEnvironment(output: string) {
  return /environment variable not found:\s*DATABASE_URL/i.test(output) || /non-standard "NODE_ENV"/i.test(output);
}

function isSchemaValidationCommand(command: string) {
  if (isLiveDatabaseCommand(command)) return false;
  return command === "npx prisma validate" || command === "prisma validate";
}

function isLiveDatabaseCommand(command: string) {
  return /\bprisma\s+(migrate|db|studio)\b/.test(command) || /\b(migrate|db\s+push|db\s+execute)\b/.test(command);
}

function schemaValidationNeedsPlaceholder(workspacePath?: string) {
  if (!workspacePath) return true;
  const schemaPath = path.join(workspacePath, "prisma", "schema.prisma");
  if (!fs.existsSync(schemaPath)) return true;
  return /env\(\s*["']DATABASE_URL["']\s*\)/.test(fs.readFileSync(schemaPath, "utf8"));
}

function isProductionBuildCommand(command: string, workspacePath?: string) {
  if (command === "next build" || command === "npx next build") return true;
  if (command !== "npm run build") return false;
  if (!workspacePath) return true;
  return workspaceUsesNext(workspacePath);
}

function workspaceUsesNext(root: string) {
  if (["next.config.js", "next.config.ts", "next.config.mjs"].some((name) => fs.existsSync(path.join(root, name)))) {
    return true;
  }
  const packagePath = path.join(root, "package.json");
  if (!fs.existsSync(packagePath)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    if (parsed.dependencies?.next || parsed.devDependencies?.next) return true;
    return typeof parsed.scripts?.build === "string" && /\bnext\s+build\b/.test(parsed.scripts.build);
  } catch {
    return false;
  }
}

export type FailureDisposition = "environment" | "scope" | "implementation";

export function validationFailureDisposition(command: string, assessment: BootstrapAssessment): FailureDisposition {
  if (command === "npm run build" && assessment.missingFiles.length > 0) return "scope";
  if (assessment.environment.some((item) => item.command === command)) return "environment";
  return "implementation";
}

export function recoveryForFailures(dispositions: FailureDisposition[]) {
  if (dispositions.includes("scope")) return "revise" as const;
  if (dispositions.length === 0) return "none" as const;
  return "repair" as const;
}

export function workItemProduces(steps: string[], file: string) {
  const needle = normalise(file).toLowerCase();
  return steps.some((step) => step.toLowerCase().replaceAll("\\", "/").includes(needle));
}

export function creationStepFor(file: string, mode: "create" | "update" = "create") {
  const target = normalise(file);
  if (mode === "update") return `Update ${target}.`;
  if (/\/layout\.tsx$/.test(target) && target.includes("/app/")) {
    return `Create ${target} as the root Next.js App Router layout.`;
  }
  if (/\/page\.tsx$/.test(target) && target.includes("/app/")) {
    return `Create ${target} as the initial application route.`;
  }
  if (/\/index\.tsx$/.test(target) && target.includes("/pages/")) {
    return `Create ${target} as the initial Pages Router page.`;
  }
  return `Create ${target}.`;
}

/**
 * Work-item text that authorises an existing or planned file change for plan-scope revisions.
 * Keeps file-to-work-item traceability without inventing unrelated implementation work.
 */
export function authorisationStepFor(file: string, verb: "created" | "modified" | "deleted") {
  const target = normalise(file);
  if (verb === "deleted") return `Delete ${target}.`;
  const toolingIgnore = target === ".gitignore" || target.endsWith("/.gitignore");
  if (toolingIgnore) {
    return verb === "modified"
      ? `Modify ${target} to exclude generated files from version control.`
      : `Create ${target} to exclude generated files from version control.`;
  }
  if (verb === "modified") return creationStepFor(target, "update");
  return creationStepFor(target, "create");
}

/** Add missing work items for authorised files. Preserves existing steps; does not invent unrelated work. */
export function repairPlanWorkItemCoverage(input: {
  files: string[];
  steps: string[];
  fileStatus?: Record<string, string>;
}) {
  const files = input.files.map(normalise);
  const steps = [...input.steps];
  const added: string[] = [];
  for (const file of files) {
    if (workItemProduces(steps, file)) continue;
    const status = (input.fileStatus?.[file] ?? "modified").toLowerCase();
    const verb = status === "deleted" || status === "removed"
      ? "deleted" as const
      : status === "modified" || status === "changed"
        ? "modified" as const
        : "created" as const;
    const step = authorisationStepFor(file, verb);
    steps.push(step);
    added.push(step);
  }
  return { files, steps, added };
}

/** Install step text must not name package.json — fileMentions would treat it as out-of-scope. */
export const INSTALL_DEPENDENCIES_STEP = "Install dependencies with npm install.";

const LEGACY_INSTALL_STEP = /^Install dependencies from package\.json with npm install\.?$/i;

export function healPlanCommandSteps(steps: string[]) {
  return steps.map((step) => (LEGACY_INSTALL_STEP.test(step.trim()) ? INSTALL_DEPENDENCIES_STEP : step));
}

const SCHEMA_FILE = "prisma/schema.prisma";
const PRISMA_MODEL = /^\s*model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm;
const DUMMY_MODEL = /^\s*model\s+(Example|Test|Placeholder)\b/m;

export function trimRedundantSchemaScope(input: {
  files: string[];
  steps: string[];
  schemaContent: string | null;
}) {
  const files = input.files.map(normalise);
  if (!files.includes(SCHEMA_FILE) || !input.schemaContent || DUMMY_MODEL.test(input.schemaContent)) {
    return { files: input.files.map(normalise), steps: [...input.steps], removedSchema: false };
  }
  const models = [...input.schemaContent.matchAll(PRISMA_MODEL)].map((match) => match[1]!);
  if (models.length === 0) {
    return { files: input.files.map(normalise), steps: [...input.steps], removedSchema: false };
  }
  const modelSet = new Set(models.map((name) => name.toLowerCase()));
  const needsSchemaWork = input.steps.some((step) => {
    const named = [...step.matchAll(/\bmodel\s+([A-Za-z_][A-Za-z0-9_]*)\b/gi)].map((match) => match[1]!);
    if (named.some((name) => !modelSet.has(name.toLowerCase()))) return true;
    if (!/schema\.prisma/i.test(step) && !/\bprisma\b/i.test(step)) return false;
    if (/^(create|update)\s+prisma\/schema\.prisma\.?$/i.test(step.trim())) return false;
    return /\b(add|create|define|introduce|extend|migrate|field|relation)\b/i.test(step);
  });
  if (needsSchemaWork) {
    return { files: input.files.map(normalise), steps: [...input.steps], removedSchema: false };
  }
  const withoutSchemaSteps = input.steps.filter((step) => {
    if (/\bprisma\/schema\.prisma\b/i.test(step)) return false;
    // Drop narrative-only schema work once existing models already satisfy the task.
    if (/\bprisma\b/i.test(step) && /\bschema\b/i.test(step) && !/\b(route|page|endpoint|api|ui|component|feed|action)\b/i.test(step)) {
      return false;
    }
    return true;
  });
  if (withoutSchemaSteps.some((step) => /\bschema\.prisma\b/i.test(step))) {
    return { files: input.files.map(normalise), steps: [...input.steps], removedSchema: false };
  }
  return {
    files: files.filter((file) => file !== SCHEMA_FILE),
    steps: withoutSchemaSteps,
    removedSchema: true,
  };
}

export function existingSchemaPlanningNote(schemaContent: string | null) {
  if (!schemaContent || DUMMY_MODEL.test(schemaContent)) return "";
  const models = [...schemaContent.matchAll(PRISMA_MODEL)].map((match) => match[1]!);
  if (models.length === 0) return "";
  return [
    `Existing prisma/schema.prisma already defines models: ${models.join(", ")}.`,
    "Do not list prisma/schema.prisma in filesExpectedToChange unless this task requires new or changed models.",
    "Prefer leaving the schema out of scope when the existing models already satisfy the task.",
  ].join(" ");
}

const PLAN_COMMANDS = ["npm install", "npx prisma generate", "npx prisma validate", "npm run build", "npm test", "npm run lint", "npm run typecheck"];

function isCommandStep(step: string) {
  return PLAN_COMMANDS.some((command) => step.includes(command));
}

export function alignExecutionPlan(input: {
  files: string[];
  steps: string[];
  validationCommands: { command: string; applicability?: string; reason?: string; kind?: string }[];
  validationPlan: string;
  existingFiles?: string[];
}) {
  const files = input.files.map(normalise);
  const existing = new Set((input.existingFiles ?? []).map(normalise));
  const steps = healPlanCommandSteps(input.steps);
  const created = files
    .filter((file) => !workItemProduces(steps, file))
    .map((file) => creationStepFor(file, existing.has(file) ? "update" : "create"));
  const commandIndex = steps.findIndex(isCommandStep);
  const withFiles = created.length === 0
    ? steps
    : commandIndex === -1
      ? [...steps, ...created]
      : [...steps.slice(0, commandIndex), ...created, ...steps.slice(commandIndex)];
  const withCommands = [...withFiles];
  for (const command of input.validationCommands) {
    if (command.applicability === "NOT_APPLICABLE" || withCommands.some((step) => step.includes(command.command))) continue;
    if (command.command === "npm install") withCommands.push(INSTALL_DEPENDENCIES_STEP);
    if (command.command === "npx prisma generate") withCommands.push("Generate the Prisma client with npx prisma generate.");
    if (command.command === "npx prisma validate") withCommands.push("Validate the Prisma schema with npx prisma validate.");
    if (command.command === "npm run build") withCommands.push("Run the Next.js production build with npm run build.");
  }
  return {
    steps: withCommands,
    validationPlan: planVerificationSummary(input.validationCommands),
  };
}

export function planVerificationSummary(commands: { command: string; applicability?: string; reason?: string }[]) {
  const required = commands.filter((item) => item.applicability !== "NOT_APPLICABLE" && item.applicability !== "OPTIONAL");
  const skipped = commands.filter((item) => item.applicability === "NOT_APPLICABLE");
  return [
    required.length ? `Required:\n${required.map((item) => item.command).join("\n")}` : "",
    skipped.length ? `Not applicable:\n${skipped.map((item) => `${item.command}${item.reason ? `. ${item.reason}` : ""}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

export function technicalCompletionCriteria(input: {
  files: string[];
  validationCommands: { command: string; applicability?: string }[];
}) {
  const required = input.validationCommands
    .filter((item) => item.applicability !== "NOT_APPLICABLE" && item.applicability !== "OPTIONAL")
    .map((item) => item.command);
  const files = input.files.map(normalise);
  const lines: string[] = [];
  const layout = files.find((file) => /\/layout\.tsx$/.test(file) && file.includes("/app/"));
  const page = files.find((file) => /\/page\.tsx$/.test(file) && file.includes("/app/"));
  const pagesIndex = files.find((file) => /\/index\.tsx$/.test(file) && file.includes("/pages/"));
  if (layout && page) lines.push(`The Next.js App Router entry structure exists (${layout} and ${page}).`);
  else if (pagesIndex) lines.push(`The Pages Router entry exists (${pagesIndex}).`);
  if (required.includes("npx prisma validate")) lines.push("The Prisma schema validates.");
  if (required.includes("npx prisma generate")) lines.push("The Prisma client can be generated.");
  if (required.includes("npm run build")) lines.push("The Next.js production build succeeds.");
  return lines;
}

export function assessPlanConsistency(input: {
  files: string[];
  steps: string[];
  validationCommands: { command: string; applicability?: string; reason?: string }[];
  validationPlan: string;
  verificationSummary?: string;
}) {
  const blockers: ContractBlocker[] = [];
  const unproducedFiles = input.files.map(normalise).filter((file) => !workItemProduces(input.steps, file));
  if (unproducedFiles.length > 0) {
    const entry = unproducedFiles.filter((file) => /\/(?:layout|page)\.tsx$/.test(file) || /\/pages\/index\.tsx$/.test(file));
    const named = (entry.length > 0 ? entry : unproducedFiles).join(", ");
    blockers.push({
      step: null,
      category: "COMPLETENESS",
      message: `Execution Plan cannot be approved because ${named} ${named.includes(",") ? "are" : "is"} in scope but no work item creates ${named.includes(",") ? "them" : "it"}. Revise the execution plan.`,
    });
  }
  const outside = fileMentions(input.steps).filter((file) => !input.files.map(normalise).includes(file));
  if (outside.length > 0) {
    blockers.push({
      step: null,
      category: "COMPLETENESS",
      message: `Execution Plan cannot be approved because a work item names ${outside.join(", ")}, which is outside the approved file scope.`,
    });
  }
  const byCommand = new Map<string, Set<string>>();
  for (const command of input.validationCommands) {
    const applicability = command.applicability ?? "REQUIRED";
    const seen = byCommand.get(command.command) ?? new Set<string>();
    seen.add(applicability);
    byCommand.set(command.command, seen);
    if (applicability === "REQUIRED" && !isCatalogCommand(command.command)) {
      blockers.push({
        step: null,
        category: "COMPLETENESS",
        message: `Execution Plan cannot be approved because required command ${command.command} is not authorised.`,
      });
    }
  }
  for (const [command, applicability] of byCommand) {
    if (applicability.has("REQUIRED") && applicability.has("NOT_APPLICABLE")) {
      blockers.push({
        step: null,
        category: "COMPLETENESS",
        message: `Execution Plan cannot be approved because ${command} is marked both required and not applicable.`,
      });
    }
  }
  const requiredCommands = input.validationCommands
    .filter((item) => item.applicability !== "NOT_APPLICABLE" && item.applicability !== "OPTIONAL")
    .map((item) => item.command);
  const missingFromPlan = requiredCommands.filter((command) => !input.validationPlan.includes(command));
  if (input.validationPlan.trim() && missingFromPlan.length > 0) {
    blockers.push({
      step: null,
      category: "COMPLETENESS",
      message: `Execution Plan cannot be approved because the verification plan does not include required validation ${missingFromPlan.join(", ")}.`,
    });
  }
  const summary = input.verificationSummary ?? `${input.validationPlan}\n${planVerificationSummary(input.validationCommands)}`;
  const testSkipped = input.validationCommands.some((item) => item.command === "npm test" && item.applicability === "NOT_APPLICABLE");
  if (testSkipped && unitTestsMarkedRequired(summary)) {
    blockers.push({
      step: null,
      category: "COMPLETENESS",
      message: "Execution Plan cannot be approved because npm test is not applicable and the verification plan also describes unit tests as required.",
    });
  }
  return { ready: blockers.length === 0, blockers, unproducedFiles };
}

function unitTestsMarkedRequired(text: string) {
  return text.split(/\n|(?<=\.)\s+/).some((line) =>
    /unit tests?/i.test(line)
    && /\brequired\b/i.test(line)
    && !/\bnot (?:a )?required\b/i.test(line)
    && !/not applicable/i.test(line),
  );
}

function fileMentions(steps: string[]) {
  const found = new Set<string>();
  const pattern = /(?:^|[\s`'"(])((?:[\w.-]+\/)+[\w.-]+\.(?:tsx|ts|jsx|js|json|prisma|css)|[\w.-]+\.(?:json|prisma))(?![\w])/g;
  for (const step of steps) {
    for (const match of step.matchAll(pattern)) {
      const file = normalise(match[1] ?? "");
      if (file) found.add(file);
    }
  }
  return [...found];
}

export function planWorkDelta(before: string[], after: string[]) {
  return {
    added: after.filter((step) => !before.includes(step)),
    removed: before.filter((step) => !after.includes(step)),
    unchanged: after.filter((step) => before.includes(step)),
  };
}

export function planScopeDelta(before: string[], after: string[]) {
  const previous = new Set(before);
  const next = new Set(after);
  return {
    added: after.filter((file) => !previous.has(file)),
    removed: before.filter((file) => !next.has(file)),
    unchanged: after.filter((file) => previous.has(file)),
  };
}

export function executionPlanRevisionText(input: {
  reason: string;
  added: string[];
  removed: string[];
  unchanged: string[];
  validation: string[];
  addedWork?: string[];
}) {
  const lines = [
    input.reason,
    "",
    "ADDED SCOPE",
    input.added.join("\n") || "None",
    "",
    "UNCHANGED",
    input.unchanged.join("\n") || "None",
  ];
  if (input.removed.length > 0) lines.push("", "REMOVED", input.removed.join("\n"));
  if (input.addedWork && input.addedWork.length > 0) lines.push("", "ADDED WORK", input.addedWork.join("\n"));
  lines.push("", "VALIDATION", input.validation.join("\n") || "None");
  return lines.join("\n");
}

function designCorpus(design: DesignFacts) {
  return [
    design.architectureSummary,
    design.frontendApproach,
    design.backendApproach,
    ...design.technologyChoices,
    design.taskTitle,
    design.taskObjective,
    design.taskDescription,
    design.taskGuidance,
    design.filesLikely,
    design.validation,
  ].join("\n");
}

function mentionsNext(text: string) {
  return /\bnext\.?js\b/i.test(text);
}

function isApplicationBootstrap(design: DesignFacts, files: string[], greenfield: boolean) {
  const text = `${design.taskTitle}\n${design.taskObjective}\n${design.taskDescription}\n${design.taskGuidance}`;
  if (/initiali[sz]e|set up the|bootstrap|foundational repository|project structure/i.test(text)) return true;
  return greenfield && files.some((file) => /(^|\/)package\.json$/.test(normalise(file)));
}

function detectRouter(corpus: string, files: string[]): "app" | "pages" | null {
  const namedApp = /\bapp router\b/i.test(corpus);
  const namedPages = /\bpages router\b/i.test(corpus);
  const appPath = mentionsPrefix(corpus, files, "src/app") || mentionsPrefix(corpus, files, "app");
  const pagesPath = mentionsPrefix(corpus, files, "src/pages") || mentionsPrefix(corpus, files, "pages");
  if (namedApp || (appPath && !namedPages)) return "app";
  if (namedPages || pagesPath) return "pages";
  return null;
}

function appRouterRoot(corpus: string, files: string[]) {
  if (mentionsPrefix(corpus, files, "src/app") || files.some((file) => normalise(file).startsWith("src/"))) return "src/app";
  return "app";
}

function pagesRouterRoot(corpus: string, files: string[]) {
  if (mentionsPrefix(corpus, files, "src/pages")) return "src/pages";
  return "pages";
}

function mentionsPrefix(corpus: string, files: string[], prefix: string) {
  const root = prefix.replace(/\/$/, "");
  if (files.map(normalise).some((file) => file === root || file.startsWith(`${root}/`))) return true;
  return corpus.includes(`${root}/`);
}

function normalise(file: string) {
  return file.replaceAll("\\", "/").replace(/^\.\//, "");
}

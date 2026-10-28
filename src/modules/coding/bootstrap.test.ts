import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  alignExecutionPlan,
  assessBootstrapCompleteness,
  assessPlanConsistency,
  authorisationStepFor,
  existingSchemaPlanningNote,
  executionPlanRevisionText,
  healPlanCommandSteps,
  INSTALL_DEPENDENCIES_STEP,
  planScopeDelta,
  planVerificationSummary,
  PRISMA_VALIDATE_PLACEHOLDER,
  recoveryForFailures,
  repairPlanWorkItemCoverage,
  technicalCompletionCriteria,
  trimRedundantSchemaScope,
  validationFailureDisposition,
  validationProcessEnvironment,
  workItemProduces,
} from "@/modules/coding/bootstrap";

const nextDesign = {
  architectureSummary: "A Next.js modular monolith.",
  frontendApproach: "Responsive Next.js React.",
  backendApproach: "Next.js Server Actions.",
  technologyChoices: ["Next.js (App Router) with TypeScript", "PostgreSQL with Prisma ORM"],
  taskTitle: "Initialize Next.js project and database schema.",
  taskObjective: "Establish foundational repository structure and database connectivity.",
  taskDescription: "Create the Next.js application and the Prisma schema.",
  taskGuidance: "Follow standard Next.js app router structure.",
  filesLikely: "package.json, prisma/schema.prisma, src/app/layout.tsx",
  validation: "Run npm run build and prisma migrate status.",
};

const v2Files = ["package.json", "tsconfig.json", "prisma/schema.prisma", "src/lib/db.ts"];

const requiredValidation = [
  { command: "npx prisma validate", applicability: "REQUIRED" },
  { command: "npm run build", applicability: "REQUIRED" },
  { command: "npm test", applicability: "NOT_APPLICABLE" },
];

describe("execution plan completeness", () => {
  it("rejects a greenfield Next.js bootstrap that cannot satisfy npm run build", () => {
    const assessment = assessBootstrapCompleteness({
      files: v2Files,
      validationCommands: requiredValidation,
      design: nextDesign,
      greenfield: true,
    });
    expect(assessment.ready).toBe(false);
    expect(assessment.router).toBe("app");
    expect(assessment.routerRoot).toBe("src/app");
    expect(assessment.missingFiles).toEqual(["src/app/layout.tsx", "src/app/page.tsx"]);
    expect(assessment.blockers[0]?.category).toBe("COMPLETENESS");
    expect(assessment.blockers[0]?.message).toMatch(/cannot be approved/);
    expect(assessment.blockers[0]?.message).toMatch(/npm run build/);
    expect(assessment.blockers[0]?.message).toContain("src/app/layout.tsx");
    expect(assessment.blockers[0]?.message).toContain("src/app/page.tsx");
  });

  it("accepts a bootstrap that names the App Router entry point", () => {
    const assessment = assessBootstrapCompleteness({
      files: [...v2Files, "src/app/layout.tsx", "src/app/page.tsx"],
      validationCommands: requiredValidation,
      design: nextDesign,
      greenfield: true,
    });
    expect(assessment.ready).toBe(true);
    expect(assessment.missingFiles).toEqual([]);
  });

  it("does not invent Pages Router when the design names App Router", () => {
    const assessment = assessBootstrapCompleteness({
      files: v2Files,
      validationCommands: requiredValidation,
      design: { ...nextDesign, filesLikely: "package.json, pages/index.tsx, src/app/layout.tsx" },
      greenfield: true,
    });
    expect(assessment.router).toBe("app");
    expect(assessment.requiredFiles).toEqual(["src/app/layout.tsx", "src/app/page.tsx"]);
  });

  it("does not guess a router the design did not name", () => {
    const assessment = assessBootstrapCompleteness({
      files: ["package.json"],
      validationCommands: [{ command: "npm run build", applicability: "REQUIRED" }],
      design: {
        ...nextDesign,
        technologyChoices: ["Next.js with TypeScript"],
        taskGuidance: "Create the application.",
        filesLikely: "package.json",
      },
      greenfield: true,
    });
    expect(assessment.ready).toBe(false);
    expect(assessment.router).toBeNull();
    expect(assessment.blockers[0]?.message).toMatch(/does not specify App Router or Pages Router/);
  });

  it("leaves a non-Next.js task ready", () => {
    const assessment = assessBootstrapCompleteness({
      files: ["src/claims/submit.ts"],
      validationCommands: [{ command: "npm test", applicability: "REQUIRED" }],
      design: {
        architectureSummary: "A modular monolith accepts the notice.",
        taskTitle: "Accept a simple claim",
        taskObjective: "Accept a notice and return a reference.",
      },
      greenfield: false,
    });
    expect(assessment.ready).toBe(true);
  });
});

describe("validation environment", () => {
  it("supplies a non-secret placeholder only to prisma validate", () => {
    const builder = "postgresql://apf:apf_dev_password@127.0.0.1:5432/ai_product_factory";
    const validate = validationProcessEnvironment("npx prisma validate", builder);
    expect(validate.env.DATABASE_URL).toBe(PRISMA_VALIDATE_PLACEHOLDER);
    expect(validate.env.DATABASE_URL).not.toBe(builder);
    expect(validate.note).toMatch(/non-secret placeholder/);
    expect(validate.note).not.toContain(builder);
    expect(validate.note).not.toContain("apf_dev_password");
    expect(validate.note).not.toContain("postgresql://");
    expect(validationProcessEnvironment("npx prisma generate", builder).env.DATABASE_URL).toBeUndefined();
    expect(validationProcessEnvironment("npm install", builder).env.DATABASE_URL).toBeUndefined();
    expect(validationProcessEnvironment("npm run build", builder).env.DATABASE_URL).toBeUndefined();
  });

  it("sets NODE_ENV=production only for a Next.js production build", () => {
    const nextRoot = fs.mkdtempSync(path.join(os.tmpdir(), "apf-next-env-"));
    const otherRoot = fs.mkdtempSync(path.join(os.tmpdir(), "apf-other-env-"));
    fs.writeFileSync(path.join(nextRoot, "package.json"), JSON.stringify({ dependencies: { next: "14.2.3" }, scripts: { build: "next build" } }));
    fs.writeFileSync(path.join(otherRoot, "package.json"), JSON.stringify({ scripts: { build: "go build" } }));
    expect(validationProcessEnvironment("npm run build", undefined, nextRoot).env.NODE_ENV).toBe("production");
    expect(validationProcessEnvironment("npm run build", undefined, otherRoot).env.NODE_ENV).toBeUndefined();
    expect(validationProcessEnvironment("npx next build").env.NODE_ENV).toBe("production");
    fs.rmSync(nextRoot, { recursive: true, force: true });
    fs.rmSync(otherRoot, { recursive: true, force: true });
  });

  it("does not supply the placeholder for live database commands", () => {
    const builder = "postgresql://apf:apf_dev_password@127.0.0.1:5432/ai_product_factory";
    for (const command of ["npx prisma migrate dev", "npx prisma db push", "npx prisma studio"]) {
      const environment = validationProcessEnvironment(command, builder);
      expect(environment.env.DATABASE_URL).toBeUndefined();
      expect(JSON.stringify(environment)).not.toContain("apf_dev_password");
      expect(JSON.stringify(environment)).not.toContain(builder);
    }
  });

  it("does not write the placeholder into a product directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apf-validation-env-"));
    const before = fs.readdirSync(dir);
    validationProcessEnvironment("npx prisma validate", "postgresql://builder:secret@127.0.0.1:5432/ai_product_factory");
    expect(fs.readdirSync(dir)).toEqual(before);
    expect(fs.existsSync(path.join(dir, ".env"))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("repair or revise", () => {
  const incomplete = assessBootstrapCompleteness({
    files: v2Files,
    validationCommands: requiredValidation,
    design: nextDesign,
    greenfield: true,
  });
  const complete = assessBootstrapCompleteness({
    files: [...v2Files, "src/app/layout.tsx", "src/app/page.tsx"],
    validationCommands: requiredValidation,
    design: nextDesign,
    greenfield: true,
  });

  it("treats a Prisma validation failure as an environment correction", () => {
    expect(validationFailureDisposition("npx prisma validate", incomplete)).toBe("environment");
  });

  it("treats a missing Next.js entry point as plan scope", () => {
    expect(validationFailureDisposition("npm run build", incomplete)).toBe("scope");
  });

  it("treats a build failure inside a complete plan as an implementation defect", () => {
    expect(validationFailureDisposition("npm run build", complete)).toBe("implementation");
    expect(recoveryForFailures(["implementation"])).toBe("repair");
  });

  it("revises when any required failure needs scope outside the approved plan", () => {
    expect(recoveryForFailures(["environment", "scope"])).toBe("revise");
    expect(recoveryForFailures(["scope"])).toBe("revise");
  });

  it("fails when an authorised file has no work item that creates it", () => {
    const steps = [
      "Create package.json",
      "Create tsconfig.json",
      "Create prisma/schema.prisma",
      "Create src/lib/db.ts",
      "Install dependencies with npm install.",
      "Generate the Prisma client with npx prisma generate.",
      "Validate the Prisma schema with npx prisma validate.",
    ];
    const files = [...v2Files, "src/app/layout.tsx", "src/app/page.tsx"];
    const assessment = assessBootstrapCompleteness({
      files,
      steps,
      validationCommands: requiredValidation,
      validationPlan: "Required:\nnpx prisma validate\nnpm run build",
      design: nextDesign,
      greenfield: true,
    });
    expect(assessment.ready).toBe(false);
    expect(assessment.blockers[0]?.message).toContain("src/app/layout.tsx");
    expect(assessment.blockers[0]?.message).toContain("src/app/page.tsx");
    expect(assessment.blockers[0]?.message).toMatch(/no work item creates/);
  });

  it("passes when the App Router files have explicit creation work", () => {
    const files = [...v2Files, "src/app/layout.tsx", "src/app/page.tsx"];
    const aligned = alignExecutionPlan({
      files,
      steps: [
        "Create package.json",
        "Create tsconfig.json",
        "Create prisma/schema.prisma",
        "Create src/lib/db.ts",
        "Install dependencies with npm install.",
        "Generate the Prisma client with npx prisma generate.",
        "Validate the Prisma schema with npx prisma validate.",
      ],
      validationCommands: requiredValidation,
      validationPlan: "Run npx prisma validate and npm run build.",
    });
    expect(aligned.steps).toContain("Create src/app/layout.tsx as the root Next.js App Router layout.");
    expect(aligned.steps).toContain("Create src/app/page.tsx as the initial application route.");
    expect(aligned.steps.at(-1)).toContain("npm run build");
    const assessment = assessBootstrapCompleteness({
      files,
      steps: aligned.steps,
      validationCommands: requiredValidation,
      validationPlan: aligned.validationPlan,
      design: nextDesign,
      greenfield: true,
    });
    expect(assessment.ready).toBe(true);
  });

  it("rejects an authorised file that has no covering work item", () => {
    const files = [...v2Files, ".gitignore"];
    const steps = v2Files.map((file) => `Create ${file}.`);
    const result = assessPlanConsistency({
      files,
      steps,
      validationCommands: requiredValidation,
      validationPlan: "Required:\nnpx prisma validate\nnpm run build\n\nNot applicable:\nnpm test",
    });
    expect(result.ready).toBe(false);
    expect(result.unproducedFiles).toEqual([".gitignore"]);
    expect(result.blockers[0]?.message).toMatch(/no work item creates/);
  });

  it("repairs missing work-item coverage for a modified file without dropping prior work", () => {
    const prior = [
      "Create src/app/api/discovery/feed/route.ts.",
      "Create src/app/api/discovery/action/route.ts.",
      "Create src/app/discovery/page.tsx.",
    ];
    const files = [
      "src/app/api/discovery/feed/route.ts",
      "src/app/api/discovery/action/route.ts",
      "src/app/discovery/page.tsx",
      ".gitignore",
    ];
    const repaired = repairPlanWorkItemCoverage({
      files,
      steps: prior,
      fileStatus: { ".gitignore": "modified" },
    });
    expect(repaired.steps.slice(0, 3)).toEqual(prior);
    expect(repaired.added).toEqual([
      "Modify .gitignore to exclude generated files from version control.",
    ]);
    expect(workItemProduces(repaired.steps, ".gitignore")).toBe(true);
    const result = assessPlanConsistency({
      files,
      steps: repaired.steps,
      validationCommands: requiredValidation,
      validationPlan: "Required:\nnpx prisma validate\nnpm run build\n\nNot applicable:\nnpm test",
    });
    expect(result.ready).toBe(true);
    expect(result.unproducedFiles).toEqual([]);
  });

  it("names create, modify, and delete authorisation work items from the change verb", () => {
    expect(authorisationStepFor("src/app/page.tsx", "created")).toContain("Create src/app/page.tsx");
    expect(authorisationStepFor("src/lib/db.ts", "modified")).toBe("Update src/lib/db.ts.");
    expect(authorisationStepFor("README.md", "deleted")).toBe("Delete README.md.");
  });

  it("fails when npm test is not applicable and unit tests are also required", () => {
    const result = assessPlanConsistency({
      files: v2Files,
      steps: v2Files.map((file) => `Create ${file}.`),
      validationCommands: requiredValidation,
      validationPlan: "Required:\nnpx prisma validate\nnpm run build\n\nNot applicable:\nnpm test",
      verificationSummary: "Required checks: npm run build, prisma validate, unit tests execution",
    });
    expect(result.ready).toBe(false);
    expect(result.blockers.some((item) => item.message.includes("unit tests"))).toBe(true);
  });

  it("accepts a verification plan that keeps npm test not applicable", () => {
    const summary = planVerificationSummary(requiredValidation);
    expect(summary).toContain("npx prisma validate");
    expect(summary).toContain("npm run build");
    expect(summary).toMatch(/Not applicable:\nnpm test/);
    expect(summary).not.toMatch(/unit tests execution/);
    const result = assessPlanConsistency({
      files: v2Files,
      steps: v2Files.map((file) => `Create ${file}.`),
      validationCommands: requiredValidation,
      validationPlan: summary,
      verificationSummary: summary,
    });
    expect(result.ready).toBe(true);
  });

  it("keeps technical completion separate from product acceptance criteria", () => {
    const technical = technicalCompletionCriteria({
      files: [...v2Files, "src/app/layout.tsx", "src/app/page.tsx"],
      validationCommands: [
        { command: "npx prisma generate", applicability: "REQUIRED" },
        ...requiredValidation,
      ],
    });
    const productAcceptance = "Not linked";
    expect(technical).toEqual([
      "The Next.js App Router entry structure exists (src/app/layout.tsx and src/app/page.tsx).",
      "The Prisma schema validates.",
      "The Prisma client can be generated.",
      "The Next.js production build succeeds.",
    ]);
    expect(technical.join(" ")).not.toContain(productAcceptance);
    expect(technical.join(" ")).not.toMatch(/register|dashboard|authentication/i);
  });

  it("describes the scope added by the next plan version", () => {
    const before = v2Files;
    const after = [...v2Files, "src/app/layout.tsx", "src/app/page.tsx"];
    const delta = planScopeDelta(before, after);
    expect(delta.added).toEqual(["src/app/layout.tsx", "src/app/page.tsx"]);
    expect(delta.removed).toEqual([]);
    expect(delta.unchanged).toEqual(v2Files);
    const text = executionPlanRevisionText({
      reason: "The latest coding run proved that the approved scope cannot satisfy npm run build.",
      added: delta.added,
      removed: delta.removed,
      unchanged: delta.unchanged,
      validation: ["npx prisma validate", "npm run build"],
    });
    expect(text).toContain("ADDED SCOPE");
    expect(text).toContain("src/app/page.tsx");
    expect(text).toContain("UNCHANGED");
    expect(text).toContain("prisma/schema.prisma");
    expect(text).toContain("VALIDATION");
    expect(text).not.toContain("REMOVED");
  });

  it("does not treat the npm install step as naming package.json outside plan scope", () => {
    const discoveryFiles = [
      "src/app/api/discovery/feed/route.ts",
      "src/app/api/discovery/action/route.ts",
      "src/app/discovery/page.tsx",
    ];
    const aligned = alignExecutionPlan({
      files: discoveryFiles,
      steps: discoveryFiles.map((file) => `Create ${file}.`),
      validationCommands: [
        { command: "npm install", applicability: "REQUIRED" },
        { command: "npm run build", applicability: "REQUIRED" },
      ],
      validationPlan: "Run npm run build.",
    });
    expect(aligned.steps).toContain(INSTALL_DEPENDENCIES_STEP);
    expect(aligned.steps.some((step) => /package\.json/i.test(step))).toBe(false);
    const withLegacy = assessPlanConsistency({
      files: discoveryFiles,
      steps: [
        ...discoveryFiles.map((file) => `Create ${file}.`),
        "Install dependencies from package.json with npm install.",
      ],
      validationCommands: [{ command: "npm run build", applicability: "REQUIRED" }],
      validationPlan: "Required:\nnpm run build",
    });
    expect(withLegacy.ready).toBe(false);
    expect(withLegacy.blockers[0]?.message).toMatch(/package\.json/);
    const healedSteps = healPlanCommandSteps([
      ...discoveryFiles.map((file) => `Create ${file}.`),
      "Install dependencies from package.json with npm install.",
    ]);
    expect(healedSteps).toContain(INSTALL_DEPENDENCIES_STEP);
    expect(assessPlanConsistency({
      files: discoveryFiles,
      steps: healedSteps,
      validationCommands: [{ command: "npm run build", applicability: "REQUIRED" }],
      validationPlan: "Required:\nnpm run build",
    }).ready).toBe(true);
  });

  it("uses Update work items for files that already exist on disk", () => {
    const aligned = alignExecutionPlan({
      files: ["prisma/schema.prisma", "src/app/discovery/page.tsx"],
      steps: [],
      validationCommands: [],
      validationPlan: "",
      existingFiles: ["prisma/schema.prisma"],
    });
    expect(aligned.steps).toContain("Update prisma/schema.prisma.");
    expect(aligned.steps).toContain("Create src/app/discovery/page.tsx as the initial application route.");
    expect(aligned.steps).not.toContain("Create prisma/schema.prisma.");
  });

  it("drops prisma/schema.prisma from scope when existing models already satisfy the task", () => {
    const schema = `
datasource db { provider = "postgresql" url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }
model Profile { id String @id }
model Swipe { id String @id }
`;
    const trimmed = trimRedundantSchemaScope({
      files: [
        "prisma/schema.prisma",
        "src/app/api/discovery/feed/route.ts",
        "src/app/discovery/page.tsx",
      ],
      steps: [
        "Create prisma/schema.prisma.",
        "Create src/app/api/discovery/feed/route.ts.",
        "Create src/app/discovery/page.tsx.",
      ],
      schemaContent: schema,
    });
    expect(trimmed.removedSchema).toBe(true);
    expect(trimmed.files).toEqual([
      "src/app/api/discovery/feed/route.ts",
      "src/app/discovery/page.tsx",
    ]);
    expect(trimmed.steps).not.toContain("Create prisma/schema.prisma.");
    expect(existingSchemaPlanningNote(schema)).toMatch(/Profile/);
    expect(existingSchemaPlanningNote(schema)).toMatch(/Do not list prisma\/schema\.prisma/);

    const withNarrative = trimRedundantSchemaScope({
      files: ["prisma/schema.prisma", "src/app/discovery/page.tsx"],
      steps: [
        "Update Prisma schema to support user connection status and profile fields for discovery.",
        "Create prisma/schema.prisma.",
        "Create src/app/discovery/page.tsx.",
      ],
      schemaContent: schema,
    });
    expect(withNarrative.removedSchema).toBe(true);
    expect(withNarrative.files).toEqual(["src/app/discovery/page.tsx"]);
    expect(withNarrative.steps).toEqual(["Create src/app/discovery/page.tsx."]);
  });

  it("keeps prisma/schema.prisma when the plan requires a new model", () => {
    const schema = `
model Profile { id String @id }
model Swipe { id String @id }
`;
    const trimmed = trimRedundantSchemaScope({
      files: ["prisma/schema.prisma", "src/app/discovery/page.tsx"],
      steps: [
        "Update prisma/schema.prisma to add model DiscoveryCard.",
        "Create src/app/discovery/page.tsx.",
      ],
      schemaContent: schema,
    });
    expect(trimmed.removedSchema).toBe(false);
    expect(trimmed.files).toContain("prisma/schema.prisma");
  });
});

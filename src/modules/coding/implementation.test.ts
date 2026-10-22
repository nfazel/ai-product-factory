import { describe, expect, it } from "vitest";

import {
  assessImplementationCompleteness,
  classifyCodingFailure,
  commandsAfterImplementationRepair,
  containsDummyPrismaModel,
  initialSchemaContext,
  repairsForCurrentImplementation,
} from "@/modules/coding/implementation";
import { validationRepairDecision } from "@/modules/coding/repair";

const schemaStep = "Create prisma/schema.prisma defining the PostgreSQL datasource and initial schema models.";
const emptySchema = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;

describe("implementation completeness", () => {
  it("fails when the approved plan requires Prisma models and the schema has none", () => {
    const content = emptySchema;
    const result = assessImplementationCompleteness({
      steps: [schemaStep],
      files: [{ path: "prisma/schema.prisma", content }],
    });
    expect(result.complete).toBe(false);
    expect(result.gaps).toEqual([{ path: "prisma/schema.prisma", kind: "MISSING_PRISMA_MODEL", workItem: schemaStep }]);
    expect(content).toBe(emptySchema);
    expect(JSON.stringify(result)).not.toMatch(/model (Example|Test|Placeholder)/);
    expect(classifyCodingFailure({ planReady: true, gaps: result.gaps, failedValidation: true })).toBe("IMPLEMENTATION_INCOMPLETE");
  });

  it("detects a missing planned file before setup would run", () => {
    const result = assessImplementationCompleteness({
      steps: ["Create src/app/page.tsx as the initial application route."],
      files: [{ path: "src/app/page.tsx", content: null }],
    });
    expect(result.gaps[0]?.kind).toBe("MISSING_FILE");
    expect(classifyCodingFailure({ planReady: true, gaps: result.gaps, failedValidation: false })).toBe("IMPLEMENTATION_INCOMPLETE");
  });

  it("passes when the schema contains a model from the approved design", () => {
    const result = assessImplementationCompleteness({
      steps: [schemaStep],
      files: [{ path: "prisma/schema.prisma", content: `${emptySchema}\nmodel User {\n  id String @id\n}\n` }],
    });
    expect(result.complete).toBe(true);
    expect(containsDummyPrismaModel("model Example {\n  id String @id\n}\n")).toBe(true);
    expect(containsDummyPrismaModel("model User {\n  id String @id\n}\n")).toBe(false);
  });

  it("keeps plan incompleteness separate from an implementation gap and a validation failure", () => {
    expect(classifyCodingFailure({ planReady: false, gaps: [], failedValidation: true })).toBe("PLAN_INCOMPLETE");
    expect(classifyCodingFailure({ planReady: true, gaps: [], failedValidation: true })).toBe("IMPLEMENTATION_VALIDATION_FAILED");
  });

  it("offers repair inside the approved file scope and reruns generate before the remaining validation", () => {
    const decision = validationRepairDecision({
      planStatus: "APPROVED",
      approvedAt: "2026-10-14T13:12:17.272Z",
      providerFailure: false,
      failures: [{ id: "generate", command: "npx prisma generate", output: "You don't have any models defined", exitCode: 1 }],
      repairAttempts: 0,
    });
    expect(decision.offer).toBe(true);
    const commands = commandsAfterImplementationRepair({
      failed: ["npx prisma generate"],
      setupCommands: ["npm install", "npx prisma generate"],
      validationCommands: ["npx prisma validate", "npm run build"],
      gaps: [{ path: "prisma/schema.prisma", kind: "MISSING_PRISMA_MODEL", workItem: schemaStep }],
    });
    expect(commands.rerun).toEqual(["npx prisma generate"]);
    expect(commands.continueValidation).toEqual(["npx prisma validate", "npm run build"]);
    expect(commands.rerun).not.toContain("npm install");
  });

  it("does not let an earlier plan's repair attempts consume the current run", () => {
    const workspaceId = "cmv54403l000071ppdx3364rt";
    const runs = [
      { createdAt: new Date("2026-10-14T11:21:30.003Z"), input: { phase: "repair", workspaceId, planVersion: 2, attempt: 1 } },
      { createdAt: new Date("2026-10-14T11:21:33.701Z"), input: { phase: "repair", workspaceId, planVersion: 2, attempt: 2 } },
      { createdAt: new Date("2026-10-14T13:12:22.024Z"), input: { phase: "implement", workspaceId, planVersion: 4 } },
    ];
    expect(repairsForCurrentImplementation(runs, workspaceId, 4)).toEqual([]);
    expect(validationRepairDecision({
      planStatus: "APPROVED",
      approvedAt: "2026-10-14T13:12:17.272Z",
      providerFailure: false,
      failures: [{ id: "generate", command: "npx prisma generate", output: "no models", exitCode: 1 }],
      repairAttempts: repairsForCurrentImplementation(runs, workspaceId, 4).length,
    }).offer).toBe(true);
  });

  it("names the approved design entities without inserting a schema model", () => {
    const context = initialSchemaContext({
      dataApproach: "Relational PostgreSQL database managed via Prisma ORM supporting structured data models for users, profiles, swipes/matches, messages, and reports.",
      entities: [{ name: "User and Profile Data", description: "Core identity and profile details." }],
    });
    expect(context.named).toBe(true);
    expect(context.text).toContain("User and Profile Data");
    expect(context.text).not.toMatch(/model Example|model Test|model Placeholder/);
    expect(initialSchemaContext({}).named).toBe(false);
  });
});

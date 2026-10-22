import { describe, expect, it } from "vitest";

import {
  deriveExecutionCommands,
  executionCommandsForPlan,
  preflightExecutionPlan,
  stepsWithCommands,
} from "@/modules/coding/commands";

const greenfieldFiles = ["package.json", "tsconfig.json", "prisma/schema.prisma", "src/lib/db.ts"];
const packageJson = JSON.stringify({
  scripts: { build: "next build" },
  dependencies: { next: "^14.1.0", prisma: "^5.10.0" },
});

describe("execution contract commands", () => {
  it("authorises greenfield setup and marks unit tests not applicable", () => {
    const derived = deriveExecutionCommands({
      greenfield: true,
      filesExpected: greenfieldFiles,
      packageJson,
      nodeModulesPresent: false,
      requiredChecks: ["npm run build", "prisma validate", "unit tests execution"],
      validationPlan: "Run prisma validate and npm run build.",
    });
    const stored = executionCommandsForPlan(derived);
    expect(stored.setupCommands).toEqual(["npm install", "npx prisma generate"]);
    expect(stored.validationCommands.find((item) => item.command === "npx prisma validate")?.applicability).toBe("REQUIRED");
    expect(stored.validationCommands.find((item) => item.command === "npm run build")?.applicability).toBe("REQUIRED");
    expect(stored.validationCommands.find((item) => item.command === "npm test")?.applicability).toBe("NOT_APPLICABLE");
    const flight = preflightExecutionPlan({
      files: greenfieldFiles,
      steps: ["Create prisma/schema.prisma"],
      allowedPaths: ["src/", "prisma/", "package.json", "tsconfig.json"],
      restrictedPaths: [],
      setupCommands: stored.setupCommands,
      validationCommands: stored.validationCommands,
      derived,
    });
    expect(flight.ready).toBe(true);
  });

  it("blocks an approved plan that does not authorise the commands it requires", () => {
    const derived = deriveExecutionCommands({
      greenfield: true,
      filesExpected: greenfieldFiles,
      packageJson,
      nodeModulesPresent: false,
      requiredChecks: ["npm run build", "prisma validate", "unit tests execution"],
      validationPlan: "Run prisma validate and npm run build.",
    });
    const flight = preflightExecutionPlan({
      files: greenfieldFiles,
      steps: [
        "Initialize package.json",
        "Configure tsconfig.json",
        "Create prisma/schema.prisma",
        "Create src/lib/db.ts",
      ],
      allowedPaths: ["src/", "prisma/", "package.json", "tsconfig.json"],
      restrictedPaths: [],
      setupCommands: [],
      validationCommands: [],
      derived,
    });
    expect(flight.ready).toBe(false);
    expect(flight.blockers.some((item) => item.message.includes("npm install"))).toBe(true);
    expect(flight.blockers.some((item) => item.step === 3 && item.message.includes("npx prisma validate"))).toBe(true);
    expect(flight.blockers.some((item) => item.message.includes("not permitted"))).toBe(true);
  });

  it("rejects a command outside the catalog even when a plan names it", () => {
    const derived = deriveExecutionCommands({
      greenfield: false,
      filesExpected: ["src/claims/submit.ts"],
      packageJson: JSON.stringify({ scripts: { test: "node -e \"process.exit(0)\"" } }),
      nodeModulesPresent: true,
      requiredChecks: ["unit tests"],
      validationPlan: "npm test",
    });
    const flight = preflightExecutionPlan({
      files: ["src/claims/submit.ts"],
      steps: ["Update the helper"],
      allowedPaths: ["src/claims/**"],
      restrictedPaths: [],
      setupCommands: ["npm install evil"],
      validationCommands: executionCommandsForPlan(derived).validationCommands,
      derived,
    });
    expect(flight.ready).toBe(false);
    expect(flight.blockers.some((item) => item.message.includes("npm install evil"))).toBe(true);
  });

  it("keeps an existing test script required and does not install dependencies that are absent from package.json", () => {
    const derived = deriveExecutionCommands({
      greenfield: false,
      filesExpected: ["src/claims/submit.ts"],
      packageJson: JSON.stringify({ scripts: { test: "node -e \"process.exit(0)\"" } }),
      nodeModulesPresent: false,
      requiredChecks: ["unit tests"],
      validationPlan: "npm test",
    });
    expect(derived.find((item) => item.command === "npm install")).toBeUndefined();
    expect(derived.find((item) => item.command === "npm test")?.applicability).toBe("REQUIRED");
  });

  it("adds command steps without dropping the approved file steps", () => {
    const derived = deriveExecutionCommands({
      greenfield: true,
      filesExpected: greenfieldFiles,
      packageJson,
      nodeModulesPresent: false,
      requiredChecks: ["npm run build", "prisma validate"],
      validationPlan: "Run prisma validate and npm run build.",
    });
    const steps = stepsWithCommands(["Create prisma/schema.prisma"], derived);
    expect(steps[0]).toBe("Create prisma/schema.prisma");
    expect(steps.some((step) => step.includes("npm install"))).toBe(true);
    expect(steps.some((step) => step.includes("npx prisma validate"))).toBe(true);
  });
});

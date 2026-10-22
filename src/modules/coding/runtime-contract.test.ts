import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { compileExecutionContract } from "@/modules/coding/commands";
import { boundContract } from "@/modules/coding/runner";
import { approveCommand, ensureParentDirectory } from "@/modules/coding/policy";

const files = ["package.json", "tsconfig.json", "prisma/schema.prisma", "src/lib/db.ts"];
const allowedPaths = ["src/", "prisma/", "public/", "package.json", "tsconfig.json", "next.config.js"];
const validationCommands = [
  {
    command: "npx prisma validate",
    kind: "VALIDATION" as const,
    applicability: "REQUIRED" as const,
    reason: "The plan creates a Prisma schema, so schema validation is a required check.",
  },
  {
    command: "npm run build",
    kind: "VALIDATION" as const,
    applicability: "REQUIRED" as const,
    reason: "package.json defines a build script.",
  },
  {
    command: "npm test",
    kind: "VALIDATION" as const,
    applicability: "NOT_APPLICABLE" as const,
    reason: "package.json has no test script, so unit tests are not a required check for this task.",
  },
];

function v2Input() {
  return {
    planVersion: 2,
    files,
    allowedPaths,
    restrictedPaths: [] as string[],
    setupCommands: ["npm install", "npx prisma generate"],
    validationCommands,
  };
}

describe("compiled execution contract", () => {
  it("uses one contract for preflight and the runner, and does not execute a not-applicable check", () => {
    const preflight = compileExecutionContract(v2Input());
    expect(preflight.ready).toBe(true);
    expect(preflight.contract.setupCommands).toEqual(["npm install", "npx prisma generate"]);
    expect(preflight.contract.validationCommands.map((item) => item.command)).toEqual(["npx prisma validate", "npm run build"]);
    expect(preflight.contract.notApplicableChecks.map((item) => item.command)).toEqual(["npm test"]);
    expect(preflight.contract.executableCommands).not.toContain("npm test");

    const workspace = {
      plan: {
        version: 2,
        filesExpectedToChange: files,
        setupCommands: ["npm install", "npx prisma generate"],
        validationCommands,
      },
      contract: { allowedPaths, restrictedPaths: [] },
    };
    const fromStoredRun = boundContract(workspace as never, { executionContract: preflight.contract });
    const fromPlan = boundContract(workspace as never, {});
    expect(fromStoredRun.contract).toEqual(preflight.contract);
    expect(fromPlan.contract).toEqual(preflight.contract);

    for (const command of preflight.contract.executableCommands) {
      const decision = approveCommand(command, preflight.contract.executableCommands);
      expect(decision.ok).toBe(true);
    }
    const rejected = approveCommand("npm test", preflight.contract.executableCommands);
    expect(rejected.ok).toBe(false);
    expect(rejected.ok ? "" : rejected.reason).not.toBe("That command is not an approved check.");

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "apf-contract-"));
    fs.writeFileSync(path.join(root, "README.md"), "greenfield\n");
    fs.writeFileSync(path.join(root, ".gitignore"), "node_modules\n");
    const parent = ensureParentDirectory(root, "prisma/schema.prisma", allowedPaths, []);
    expect(parent.ok).toBe(true);
    expect(fs.statSync(path.join(root, "prisma")).isDirectory()).toBe(true);

    const runner = fs.readFileSync(path.join(process.cwd(), "src/modules/coding/runner.ts"), "utf8");
    const policy = fs.readFileSync(path.join(process.cwd(), "src/modules/coding/policy.ts"), "utf8");
    expect(runner).toContain("boundContract");
    expect(runner).not.toContain("commandForCheck");
    expect(runner).not.toContain("requiredChecks.filter");
    expect(runner).not.toContain("That command is not an approved check.");
    expect(policy).not.toContain("That command is not an approved check.");
    expect(fs.existsSync(path.join(process.cwd(), "src/modules/coding/checks.ts"))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { safeCommandOutput } from "@/modules/coding/command-output";
import {
  commandsAllowedForRepair,
  failureRecordKey,
  validationRepairDecision,
} from "@/modules/coding/repair";

const failure = {
  id: "evidence-build",
  command: "npm run build",
  output: "Couldn't find any `pages` or `app` directory.",
  exitCode: 1,
};

describe("implementation repair", () => {
  it("permits a bounded repair of an approved plan's validation failure", () => {
    expect(validationRepairDecision({
      planStatus: "APPROVED",
      approvedAt: "2026-10-13T14:37:48.365Z",
      providerFailure: false,
      failures: [failure],
      repairAttempts: 0,
    }).offer).toBe(true);
    expect(validationRepairDecision({
      planStatus: "APPROVED",
      approvedAt: "2026-10-13T14:37:48.365Z",
      providerFailure: false,
      failures: [failure],
      repairAttempts: 2,
    }).reason).toMatch(/bounded attempts/);
    expect(validationRepairDecision({
      planStatus: "PROPOSED",
      approvedAt: null,
      providerFailure: false,
      failures: [failure],
      repairAttempts: 0,
    }).offer).toBe(false);
    expect(validationRepairDecision({
      planStatus: "APPROVED",
      approvedAt: "2026-10-13T14:37:48.365Z",
      providerFailure: true,
      failures: [failure],
      repairAttempts: 0,
    }).offer).toBe(false);
    expect(validationRepairDecision({
      planStatus: "APPROVED",
      approvedAt: "2026-10-13T14:37:48.365Z",
      providerFailure: false,
      failures: [failure],
      repairAttempts: 0,
      scopeInsufficient: true,
    }).reason).toMatch(/Revise the execution plan/);
  });

  it("keeps repair commands inside the approved validation list", () => {
    expect(commandsAllowedForRepair(
      ["npm run build", "npm test", "rm -rf /"],
      ["npm run build"],
    )).toEqual(["npm run build"]);
  });

  it("uses evidence identity for identical failure text", () => {
    const message = "npm run build failed with exit 1.";
    expect(failureRecordKey("cmv59xa1t000woappog84dm8p")).not.toBe(failureRecordKey("cmv6x235y001krippd6wohjrt"));
    expect(`${message}${message}`).toContain("npm run build failed with exit 1.");
  });
});

describe("command output", () => {
  it("keeps the Prisma and build errors and redacts connection strings", () => {
    const prisma = safeCommandOutput("", "error: Environment variable not found: DATABASE_URL.\n  -->  prisma/schema.prisma:3\n 3 |   url      = env(\"DATABASE_URL\")\n");
    expect(prisma).toContain("prisma/schema.prisma:3");
    expect(prisma).toContain("Environment variable not found: DATABASE_URL");
    const build = safeCommandOutput("Couldn't find any `pages` or `app` directory.", "");
    expect(build).toContain("pages` or `app` directory");
    const secret = safeCommandOutput("DATABASE_URL=postgresql://apf:apf_dev_password@127.0.0.1:5432/ai_product_factory", "");
    expect(secret).not.toContain("apf_dev_password");
    expect(secret).not.toContain("postgresql://apf");
  });
});

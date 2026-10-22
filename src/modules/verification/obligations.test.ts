import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deriveObligations, inspectWorkspace, type ObligationInput } from "@/modules/verification/obligations";
import { decideVerdict } from "@/modules/verification/verdict";

const commit = "9abadcbfb2509ffad5902628e1d5bfcd5a8d7075";

const plan = {
  version: 4,
  status: "COMPLETED",
  files: ["package.json", "tsconfig.json", "prisma/schema.prisma", "src/lib/db.ts", "src/app/layout.tsx", "src/app/page.tsx"],
  setupCommands: ["npm install", "npx prisma generate"],
  validationCommands: [
    { command: "npx prisma validate", applicability: "REQUIRED" },
    { command: "npm run build", applicability: "REQUIRED" },
    { command: "npm test", applicability: "NOT_APPLICABLE" },
  ],
};

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apf-obligations-"));
  fs.mkdirSync(path.join(root, "src/app"), { recursive: true });
  fs.mkdirSync(path.join(root, "src/lib"), { recursive: true });
  fs.mkdirSync(path.join(root, "prisma"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  fs.writeFileSync(path.join(root, "tsconfig.json"), "{}\n");
  fs.writeFileSync(path.join(root, "src/app/layout.tsx"), "export default function Layout(){return null}\n");
  fs.writeFileSync(path.join(root, "src/app/page.tsx"), "export default function Page(){return null}\n");
  fs.writeFileSync(path.join(root, "src/lib/db.ts"), "export const db = {}\n");
  fs.writeFileSync(
    path.join(root, "prisma/schema.prisma"),
    'datasource db { provider = "postgresql" url = env("DATABASE_URL") }\nmodel User { id String @id }\n',
  );
  return root;
}

function input(patch: Partial<ObligationInput> = {}): ObligationInput {
  const root = workspace();
  return {
    plan,
    commitSha: commit,
    baseCommit: commit,
    functionalCriteria: [],
    parentCriteria: [{ workItemTitle: "Register new account", description: "An account is created and the user is directed to profile setup." }],
    architecture: "A Next.js modular monolith backed by PostgreSQL and Prisma.",
    nfrs: [{ id: "privacy", title: "UK Data Protection Compliance", status: "NOT_TESTED" }],
    inspection: inspectWorkspace(root, plan.files),
    executions: [
      { command: "npm install", kind: "PLAN_CHECK", status: "PASSED" },
      { command: "npx prisma generate", kind: "PLAN_CHECK", status: "PASSED" },
      { command: "npx prisma validate", kind: "PLAN_CHECK", status: "PASSED" },
      { command: "npm run build", kind: "PLAN_CHECK", status: "PASSED" },
      { command: "npm test", kind: "PLAN_CHECK", status: "NOT_RUN" },
    ],
    ...patch,
  };
}

function verdict(patch: Partial<ObligationInput> = {}) {
  const derived = deriveObligations(input(patch));
  return { derived, decision: decideVerdict({ coverages: [], executions: [], defects: [], blockingEscalation: false, obligations: derived.obligations }) };
}

describe("technical verification obligations", () => {
  it("passes a technical task that has no functional acceptance criteria", () => {
    const result = verdict();
    expect(result.derived.obligations.some((item) => item.kind === "FUNCTIONAL_ACCEPTANCE")).toBe(false);
    expect(result.derived.obligations.find((item) => item.id === "plan-binding")?.evidence).toContain("Execution Plan v4");
    expect(result.decision.verdict).toBe("PASS");
    expect(result.derived.definitionConcerns[0]).toMatch(/Register new account/);
    expect(result.derived.definitionConcerns[0]).toMatch(/remains unverified/);
  });

  it("does not treat the parent feature as verified", () => {
    const result = verdict();
    expect(result.derived.obligations.map((item) => item.title).join(" ")).not.toMatch(/profile setup/);
    expect(result.decision.verdict).toBe("PASS");
  });

  it("fails a genuine implementation defect", () => {
    const result = verdict({
      executions: [
        { command: "npm install", kind: "PLAN_CHECK", status: "PASSED" },
        { command: "npx prisma generate", kind: "PLAN_CHECK", status: "PASSED" },
        { command: "npx prisma validate", kind: "PLAN_CHECK", status: "PASSED" },
        { command: "npm run build", kind: "PLAN_CHECK", status: "FAILED" },
        { command: "npm test", kind: "PLAN_CHECK", status: "NOT_RUN" },
      ],
    });
    expect(result.decision.verdict).toBe("FAIL");
    expect(result.decision.reason).toMatch(/npm run build/);
  });

  it("treats an environment blockage as inconclusive rather than a product failure", () => {
    const result = verdict({
      executions: [
        { command: "npm install", kind: "PLAN_CHECK", status: "PASSED" },
        { command: "npx prisma generate", kind: "PLAN_CHECK", status: "PASSED" },
        { command: "npx prisma validate", kind: "PLAN_CHECK", status: "BLOCKED" },
        { command: "npm run build", kind: "PLAN_CHECK", status: "BLOCKED" },
        { command: "npm test", kind: "PLAN_CHECK", status: "NOT_RUN" },
      ],
    });
    expect(result.decision.verdict).toBe("INCONCLUSIVE");
    expect(result.decision.reason).toMatch(/not a product failure/);
  });

  it("does not pass when mandatory technical evidence is missing", () => {
    const current = input();
    current.inspection = { ...current.inspection, presentFiles: current.inspection.presentFiles.filter((file) => file !== "src/app/page.tsx") };
    const derived = deriveObligations(current);
    const decision = decideVerdict({ coverages: [], executions: [], defects: [], blockingEscalation: false, obligations: derived.obligations });
    expect(decision.verdict).not.toBe("PASS");
  });

  it("blocks a session that is not bound to the approved commit", () => {
    const result = verdict({ commitSha: "a".repeat(40) });
    expect(result.derived.obligations.find((item) => item.id === "plan-binding")?.status).toBe("BLOCKED");
    expect(result.decision.verdict).not.toBe("PASS");
  });

  it("keeps an unrelated historical obligation list unchanged", () => {
    const historical = deriveObligations(input());
    const snapshot = JSON.stringify(historical);
    deriveObligations(input({ commitSha: "b".repeat(40) }));
    expect(JSON.stringify(historical)).toBe(snapshot);
  });
});

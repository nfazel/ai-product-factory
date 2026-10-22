import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { CodingProgressPanel } from "@/components/build/coding-progress-panel";

const started = new Date("2026-10-14T13:12:22.025Z");
const sameInstant = "2026-10-14T17:13:59.780Z";

function evidence(id: string, command: string, result: string, at: string, exitCode: number | null = result === "PASS" ? 0 : result === "FAIL" ? 1 : null) {
  return { id, description: command || "OUT_OF_SCOPE_CHANGE README.md deleted", command, result, output: "", exitCode, createdAt: new Date(at) };
}

function workspace() {
  return {
    status: "READY_FOR_REVIEW",
    plan: {
      status: "COMPLETED",
      version: 4,
      approvedBy: "Local user",
      approvedAt: new Date("2026-10-14T13:12:17.272Z"),
      steps: ["Create package.json.", "Run npm run build."],
      validationPlan: "Required: npx prisma validate and npm run build.",
      filesExpectedToChange: ["package.json"],
      setupCommands: ["npm install", "npx prisma generate"],
      validationCommands: [
        { command: "npx prisma validate", applicability: "REQUIRED", kind: "VALIDATION", reason: "Schema." },
        { command: "npm run build", applicability: "REQUIRED", kind: "VALIDATION", reason: "Build." },
        { command: "npm test", applicability: "NOT_APPLICABLE", kind: "VALIDATION", reason: "No test script." },
      ],
    },
    contract: { requiredChecks: ["npm run build"], allowedPaths: ["."], restrictedPaths: [] },
    evidence: [
      evidence("build-old", "npm run build", "NOT RUN", "2026-10-14T13:12:38.000Z", null),
      evidence("build-repeat", "npm run build", "FAIL", sameInstant, 1),
      evidence("build-new", "npm run build", "PASS", sameInstant, 0),
      evidence("validate-new", "npx prisma validate", "PASS", "2026-10-14T17:13:42.774Z"),
      evidence("scope", "", "OUT_OF_SCOPE", "2026-10-15T12:19:22.364Z", null),
    ],
    toolEvents: [
      { id: "cmd-build-1", action: "RUN_COMMAND", allowed: true, path: "", command: "npm run build", reason: "", createdAt: new Date(sameInstant) },
      { id: "cmd-build-2", action: "RUN_COMMAND", allowed: true, path: "", command: "npm run build", reason: "", createdAt: new Date(sameInstant) },
    ],
    agentRun: { status: "COMPLETED", input: { phase: "implement", planVersion: 4 }, startedAt: started, completedAt: new Date("2026-10-14T13:20:00.000Z") },
    escalations: [],
    diff: {
      files: [
        { path: "README.md", status: "deleted", additions: 0, deletions: 5 },
        { path: "package.json", status: "added", additions: 24, deletions: 0 },
      ],
      patch: "",
      truncated: false,
      additions: 24,
      deletions: 5,
    },
    repairRuns: [
      { id: "repair-1", status: "FAILED", attempt: 1, planVersion: 4, startedAt: new Date("2026-10-14T17:13:34.927Z") },
      { id: "repair-old", status: "FAILED", attempt: 1, planVersion: 2, startedAt: new Date("2026-10-13T21:00:00.000Z") },
    ],
    codeReview: {
      approvable: false,
      reason: "Code changes include files outside the approved Execution Plan.",
      created: ["package.json"],
      modified: [],
      deleted: ["README.md"],
      approved: [{ path: "package.json", verb: "created" }],
      derived: [{ path: "package-lock.json", verb: "created" }],
      outOfScope: [{ path: "README.md", verb: "deleted" }],
      planVersion: 4,
      setup: [
        { command: "npm install", result: "PASS", passed: true },
        { command: "npx prisma generate", result: "PASS", passed: true },
      ],
      checks: [
        { command: "npx prisma validate", result: "PASS", passed: true, stale: false },
        { command: "npm run build", result: "PASS", passed: true, stale: false },
        { command: "npm run build", result: "PASS", passed: true, stale: false },
      ],
      notApplicable: ["npm test"],
    },
  };
}

const implementRuns = [1, 2, 3, 4].map((version) => ({
  id: `run-${version}`,
  outcome: "FAILED",
  startedAt: new Date(`2026-10-1${version}T12:00:00.000Z`),
  completedAt: new Date(`2026-10-1${version}T12:05:00.000Z`),
  planVersion: version === 4 ? 2 : version,
})).concat([{
  id: "run-5",
  outcome: "FAILED",
  startedAt: started,
  completedAt: new Date("2026-10-14T13:20:00.000Z"),
  planVersion: 4,
}]);

function listKeys(node: ReactNode, keys: string[][] = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => listKeys(child, keys));
    return keys;
  }
  if (!isValidElement(node)) return keys;
  const children = (node.props as { children?: ReactNode }).children;
  if (node.type === "ul") {
    const slots = (Array.isArray(children) ? children : [children]).filter((child) => child != null && child !== false);
    const nested = slots.filter((child) => Array.isArray(child));
    if (slots.length > 1 && nested.length > 0) keys.push(["__nested-array__"]);
    const rowKeys: string[] = [];
    const rows = nested.length > 0 ? nested.flat() : Array.isArray(children) ? children : [];
    for (const row of rows) {
      if (!isValidElement(row)) continue;
      rowKeys.push(row.key == null ? "__missing__" : String(row.key));
    }
    if (rowKeys.length > 0) keys.push(rowKeys);
  }
  listKeys(children, keys);
  return keys;
}

describe("coding review lists", () => {
  it("gives the out-of-scope review one keyed row per record", () => {
    const props = {
      productId: "product",
      workspaceId: "workspace",
      workspace: workspace(),
      contractBlocked: false,
      implementRuns,
    };
    const warnings: string[] = [];
    const error = console.error;
    console.error = (...args: unknown[]) => {
      const text = args.map((item) => String(item)).join("\n");
      if (text.includes("key")) warnings.push(text);
    };
    let html = "";
    try {
      html = renderToStaticMarkup(createElement(CodingProgressPanel, props));
    } finally {
      console.error = error;
    }
    const keys = listKeys(CodingProgressPanel(props));
    expect(warnings).toEqual([]);
    expect(keys.some((group) => group.includes("__nested-array__") || group.includes("__missing__"))).toBe(false);
    for (const group of keys) expect(new Set(group).size).toBe(group.length);
    expect(keys).toContainEqual(["implement:run-5", "repair:repair-1:1"]);
    expect(keys.some((group) => group.includes("event:cmd-build-1") && group.includes("event:cmd-build-2"))).toBe(true);
    expect(keys.some((group) => group.includes("evidence:build-repeat") && group.includes("evidence:build-new"))).toBe(true);
    expect(keys.some((group) => group.includes("check:npm run build") && group.includes("check:npm run build:2"))).toBe(true);
    expect(html).toContain("Restore Unapproved Change");
    expect(html).toContain("README.md — deleted — not authorised by Execution Plan v4");
    expect(html).toContain("Coding Run 5 — failed initially");
    expect(html).toContain("Repair Attempt 1 — successful");
    expect(html).not.toContain("repair-old");
  });
});

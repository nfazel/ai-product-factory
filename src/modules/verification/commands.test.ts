import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { detectRepositoryTestCommands, selectVerificationChecks } from "@/modules/verification/commands";
import { decideVerdict } from "@/modules/verification/verdict";

function directory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "apf-verify-commands-"));
}

describe("verification command selection", () => {
  it("does not treat a missing npm test script as a failed product check", () => {
    const root = directory();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "demo", scripts: { build: "next build" } }));
    const checks = selectVerificationChecks({
      workspacePath: root,
      planned: [{ command: "npm test", applicability: "REQUIRED" }],
    });
    expect(checks).toEqual([
      expect.objectContaining({ command: "npm test", disposition: "UNAVAILABLE" }),
    ]);
    expect(decideVerdict({
      coverages: [{ status: "VERIFIED", humanConfirmed: false }],
      executions: [{ kind: "PLAN_CHECK", status: "BLOCKED" }],
      defects: [],
      blockingEscalation: false,
    }).verdict).not.toBe("FAIL");
  });

  it("selects a repository test command that exists", () => {
    const root = directory();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
    fs.writeFileSync(path.join(root, "go.mod"), "module example.com/demo\n");
    const commands = detectRepositoryTestCommands(root).map((item) => item.command);
    expect(commands).toContain("npm test");
    expect(commands).toContain("go test ./...");
    const checks = selectVerificationChecks({ workspacePath: root, planned: [] });
    expect(checks.every((item) => item.disposition === "RUN")).toBe(true);
  });

  it("skips a test the approved plan marks not applicable", () => {
    const root = directory();
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
    const checks = selectVerificationChecks({
      workspacePath: root,
      planned: [{ command: "npm test", applicability: "NOT_APPLICABLE" }],
    });
    expect(checks).toEqual([
      expect.objectContaining({ command: "npm test", disposition: "NOT_APPLICABLE" }),
    ]);
  });

  it("ignores npm's placeholder test script", () => {
    const root = directory();
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "echo \"Error: no test specified\" && exit 1" } }),
    );
    expect(detectRepositoryTestCommands(root)).toEqual([]);
  });
});

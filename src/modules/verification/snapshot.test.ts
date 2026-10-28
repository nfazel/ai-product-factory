import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DomainError } from "@/modules/shared/errors";
import { changedProductFiles, assertSnapshotUnchanged, isGeneratedOutputPath } from "@/modules/verification/snapshot";

const temporary: string[] = [];

function git(dir: string, args: string[]) {
  return execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.fsmonitor=false", ...args], {
    cwd: dir,
    encoding: "utf8",
  }).trim();
}

function approvedRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apf-snapshot-"));
  temporary.push(dir);
  fs.mkdirSync(path.join(dir, "src/claims"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src/claims/submit.mjs"), "export const claim = \"approved\";\n");
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "approved"]);
  return dir;
}

afterEach(() => {
  while (temporary.length > 0) {
    const item = temporary.pop();
    if (item) fs.rmSync(item, { recursive: true, force: true });
  }
});

describe("verification snapshot isolation", () => {
  it("confirms the workspace HEAD is the approved base commit", async () => {
    const dir = approvedRepo();
    const base = git(dir, ["rev-parse", "HEAD"]);
    await expect(assertSnapshotUnchanged(dir, base)).resolves.toBeUndefined();
  });

  it("stops verification when the workspace is not at the approved commit", async () => {
    const dir = approvedRepo();
    const base = git(dir, ["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(dir, "src/claims/submit.mjs"), "export const claim = \"later\";\n");
    git(dir, ["commit", "-am", "later"]);
    await expect(assertSnapshotUnchanged(dir, base)).rejects.toBeInstanceOf(DomainError);
    await expect(assertSnapshotUnchanged(dir, base)).rejects.toThrow(/not at the approved snapshot/);
  });

  it("reports nothing when the verification run left the product untouched", async () => {
    const dir = approvedRepo();
    fs.mkdirSync(path.join(dir, "verification/claim"), { recursive: true });
    fs.writeFileSync(path.join(dir, "verification/claim/claim.test.mjs"), "// test\n");
    expect(await changedProductFiles(dir)).toEqual([]);
  });

  it("reports a tracked product file that the verification run changed", async () => {
    const dir = approvedRepo();
    fs.writeFileSync(path.join(dir, "src/claims/submit.mjs"), "export const claim = \"tampered\";\n");
    expect(await changedProductFiles(dir)).toEqual(["src/claims/submit.mjs"]);
  });

  it("reports an untracked product file that the verification run created", async () => {
    const dir = approvedRepo();
    fs.writeFileSync(path.join(dir, "src/claims/extra.mjs"), "export const extra = 1;\n");
    expect(await changedProductFiles(dir)).toEqual(["src/claims/extra.mjs"]);
  });

  it("ignores generated output of approved build and install commands", async () => {
    const dir = approvedRepo();
    fs.mkdirSync(path.join(dir, ".next/cache"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".next/cache/x.json"), "{}");
    fs.mkdirSync(path.join(dir, "node_modules/pkg"), { recursive: true });
    fs.writeFileSync(path.join(dir, "node_modules/pkg/index.js"), "module.exports = {};\n");
    fs.writeFileSync(path.join(dir, "next-env.d.ts"), "/// <reference types=\"next\" />\n");
    fs.writeFileSync(path.join(dir, "tsconfig.tsbuildinfo"), "{}");
    expect(await changedProductFiles(dir)).toEqual([]);
  });

  it("still reports a tracked file under a generated-looking directory name", async () => {
    const dir = approvedRepo();
    fs.mkdirSync(path.join(dir, "src/build"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src/build/index.mjs"), "export const b = 1;\n");
    expect(await changedProductFiles(dir)).toEqual(["src/build/index.mjs"]);
  });

  it("classifies generated output paths without matching product source", () => {
    expect(isGeneratedOutputPath(".next/server/app.js")).toBe(true);
    expect(isGeneratedOutputPath("node_modules/x/y.js")).toBe(true);
    expect(isGeneratedOutputPath("dist/index.js")).toBe(true);
    expect(isGeneratedOutputPath("src/dist/index.js")).toBe(false);
    expect(isGeneratedOutputPath("src/claims/submit.mjs")).toBe(false);
  });
});

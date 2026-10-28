import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { runProcess } from "@/modules/coding/git";
import { changedProductFiles } from "@/modules/verification/snapshot";
import { classifyTestRun } from "@/modules/verification/test-outcome";
import { defaultHttpDeps, runHttpAcceptance, type HttpAcceptanceCase } from "@/modules/verification/http/acceptance";
import { provisionVerificationDatabase } from "@/modules/verification/http/database";
import { EMPTY_FIXTURE_PLAN } from "@/modules/verification/http/fixtures";

/**
 * End-to-end lifecycle check, opt-in. It extracts the approved snapshot of the Find-a-Friend product into a temporary
 * directory, installs it, provisions a disposable database, applies the schema, builds, starts it on a loopback port,
 * runs one lifecycle probe, then stops the application and drops the database.
 *
 * It is not a verification session. The probe only checks that the application answers HTTP at its root. It is not tied
 * to any acceptance criterion, and it does not touch the Card Discovery Feed.
 *
 * Runs only when APF_HTTP_E2E=1 and VERIFICATION_DATABASE_ADMIN_URL is set. The admin URL is never printed.
 */

const PRODUCT =
  process.env.TASK4_PRODUCT_PATH ||
  "/Users/nichervanfazel/.ai-product-factory/products/cmv0tsipq0003aappiumgzxgn";
const ADMIN_URL = process.env.VERIFICATION_DATABASE_ADMIN_URL?.trim() ?? "";
const APPROVED_SNAPSHOT = "7badef4";
const ENABLED = process.env.APF_HTTP_E2E === "1" && ADMIN_URL !== "" && fs.existsSync(path.join(PRODUCT, ".git"));

const PROBE_FILE = "verification/http/lifecycle-probe.test.mjs";
const PROBE_BODY = `// verifies:lifecycle-probe
import { test } from "node:test";
import assert from "node:assert/strict";

test("lifecycle probe: the managed application answers HTTP at its root", async () => {
  const response = await fetch(new URL("/", process.env.VERIFICATION_BASE_URL));
  assert.ok(response.status < 500, "the application answered with a server error");
});
`;

describe.skipIf(!ENABLED)("HTTP lifecycle, end to end, against a temporary extraction of the approved snapshot", () => {
  let workspace = "";

  afterAll(() => {
    if (workspace) fs.rmSync(workspace, { recursive: true, force: true });
  });

  it(
    "installs, provisions, builds, starts, probes, stops, and drops, leaving nothing running",
    async () => {
      workspace = fs.mkdtempSync(path.join(os.tmpdir(), "apf-e2e-"));
      const tar = path.join(workspace, "snapshot.tar");
      const tree = path.join(workspace, "tree");
      fs.mkdirSync(tree);
      execFileSync("git", ["-C", PRODUCT, "archive", "--format=tar", "-o", tar, APPROVED_SNAPSHOT]);
      execFileSync("tar", ["-xf", tar, "-C", tree]);
      fs.rmSync(tar);
      const git = (...args: string[]) => execFileSync("git", ["-C", tree, ...args], { encoding: "utf8" }).trim();
      git("init", "-q");
      git("add", "-A");
      execFileSync("git", [
        "-C",
        tree,
        "-c",
        "user.name=verification",
        "-c",
        "user.email=verification@example.invalid",
        "commit",
        "-q",
        "-m",
        "approved snapshot",
      ]);
      const baseCommit = git("rev-parse", "HEAD");

      let droppedWith: { dropped: boolean; reason: string } | null = null;
      let applicationUrl = "";
      const deps = defaultHttpDeps({
        writeTest: async (item: HttpAcceptanceCase) => {
          const target = path.join(tree, item.filePath);
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, item.body);
          return { allowed: true, reason: "" };
        },
        runTest: async ({ command, environment }) => {
          const ran = await runProcess(command.split(" "), tree, 120_000, environment);
          return {
            allowed: true,
            reason: "",
            exitCode: ran.code,
            output: `${ran.stdout}${ran.stderr}`,
            timedOut: ran.signal !== null && ran.signal !== undefined,
          };
        },
        classify: (run) => classifyTestRun(run),
      });

      const outcomes = await runHttpAcceptance(
        {
          attemptId: randomUUID(),
          workspacePath: tree,
          baseCommit,
          cases: [{ testCaseId: "lifecycle-probe", acceptanceCriterionId: null, filePath: PROBE_FILE, body: PROBE_BODY }],
          fixturePlan: EMPTY_FIXTURE_PLAN,
          forbiddenDatabaseNames: ["ai_product_factory"],
        },
        {
          ...deps,
          provisionDatabase: async (input) => {
            const database = await provisionVerificationDatabase(input);
            return {
              ...database,
              drop: async () => {
                droppedWith = await database.drop();
                return droppedWith;
              },
            };
          },
          startApplication: async (input) => {
            const started = await deps.startApplication(input);
            if (started.ok) applicationUrl = started.app.baseUrl;
            return started;
          },
        },
      );

      const [outcome] = outcomes;
      expect(outcome?.stage, outcome?.output).toBeNull();
      expect(outcome?.attempted, outcome?.output).toBe(true);
      expect(outcome?.outcome.status, outcome?.output).toBe("PASSED");
      expect(outcome?.observations.length, "the probe made at least one request to the application").toBeGreaterThan(0);

      expect(droppedWith).toEqual({ dropped: true, reason: "" });
      expect(applicationUrl).not.toBe("");
      await expect(fetch(applicationUrl)).rejects.toThrow();

      // Reported, not hidden. A build that rewrites tracked files is a snapshot risk the framework must surface.
      const changed = await changedProductFiles(tree);
      expect(changed, "files the build changed in the approved snapshot").toEqual([]);
    },
    1_500_000,
  );
});

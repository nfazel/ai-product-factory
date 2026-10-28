import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  allocateLoopbackPort,
  APPLICATION_TIMEOUTS,
  assertAllowedArgv,
  planApplication,
  runPhase,
  startApplication,
} from "@/modules/verification/http/lifecycle";

const created: string[] = [];

afterAll(() => {
  for (const directory of created) fs.rmSync(directory, { recursive: true, force: true });
});

/** A throwaway application: a package.json with the given scripts, and the given files beside it. */
function appDirectory(scripts: Record<string, string>, files: Record<string, string> = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "apf-lifecycle-test-"));
  created.push(directory);
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({ name: "fixture-app", version: "1.0.0", private: true, scripts }),
  );
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), body);
  return directory;
}

const SERVER = `const http = require("http");
http.createServer((request, response) => response.end("ok")).listen(Number(process.env.PORT), process.env.HOST || "127.0.0.1");
`;

/** Only what npm needs. The managed application never inherits the builder's environment. */
const ENV = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? os.tmpdir(), npm_config_update_notifier: "false" };

describe("application plan", () => {
  it("refuses an approved snapshot without a lockfile, because its install could not be reproduced", () => {
    const plan = planApplication({ packageJson: { scripts: { start: "node server.js" } }, hasLockfile: false, hasPrismaSchema: false, port: 4000 });
    expect(plan).toMatchObject({ ok: false });
    expect(plan.ok === false && plan.reason).toMatch(/lockfile/);
  });

  it("refuses a snapshot with no start script and no Next.js dependency", () => {
    const plan = planApplication({ packageJson: { scripts: { test: "node --test" } }, hasLockfile: true, hasPrismaSchema: false, port: 4000 });
    expect(plan).toMatchObject({ ok: false });
    expect(plan.ok === false && plan.reason).toMatch(/start script/);
  });

  it("starts a Next.js application on the loopback port with its own allowlisted command", () => {
    const plan = planApplication({
      packageJson: { dependencies: { next: "16.0.0" }, scripts: { build: "next build" } },
      hasLockfile: true,
      hasPrismaSchema: false,
      port: 45123,
    });
    expect(plan).toMatchObject({
      ok: true,
      framework: "next",
      install: ["npm", "ci", "--no-audit", "--no-fund"],
      build: ["npm", "run", "build"],
      start: ["npx", "--no-install", "next", "start", "-p", "45123", "-H", "127.0.0.1"],
      prismaGenerate: null,
      prismaDbPush: null,
    });
  });

  it("plans Prisma generation and schema push only when the snapshot has a Prisma schema", () => {
    const plan = planApplication({
      packageJson: { scripts: { start: "node server.js" } },
      hasLockfile: true,
      hasPrismaSchema: true,
      port: 4000,
    });
    expect(plan).toMatchObject({
      ok: true,
      framework: "npm-start",
      prismaGenerate: ["npx", "--no-install", "prisma", "generate"],
      prismaDbPush: ["npx", "--no-install", "prisma", "db", "push", "--skip-generate"],
    });
  });

  it("refuses any command that is not on the allowlist, including shell strings", () => {
    expect(() => assertAllowedArgv(["sh", "-c", "rm -rf /"], 4000)).toThrow(/allowlist/);
    expect(() => assertAllowedArgv(["npm", "run", "build", "--", "--inspect"], 4000)).toThrow(/allowlist/);
    expect(() => assertAllowedArgv(["npm", "run", "start"], 4000)).not.toThrow();
  });
});

describe("loopback port", () => {
  it("allocates an unprivileged port on the loopback interface", async () => {
    const port = await allocateLoopbackPort();
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThanOrEqual(1024);
    expect(port).toBeLessThanOrEqual(65535);
  });
});

describe("managed application lifecycle", () => {
  it(
    "starts the application on loopback, answers HTTP, and stops it on shutdown",
    async () => {
      const directory = appDirectory({ start: "node server.js" }, { "server.js": SERVER });
      const port = await allocateLoopbackPort();
      const started = await startApplication({ argv: ["npm", "run", "start"], cwd: directory, env: ENV, port, healthMs: 20_000 });
      expect(started.ok).toBe(true);
      if (!started.ok) return;

      expect(started.app.baseUrl).toBe(`http://127.0.0.1:${port}`);
      const response = await fetch(`${started.app.baseUrl}/`);
      expect(response.status).toBe(200);

      const stopped = await started.app.stop();
      expect(stopped.stopped).toBe(true);
      await expect(fetch(`${started.app.baseUrl}/`)).rejects.toThrow();
    },
    30_000,
  );

  it(
    "reports an application that exits before it answers, with its startup output",
    async () => {
      const directory = appDirectory(
        { start: "node crash.js" },
        { "crash.js": `console.error("boot failed: missing configuration"); process.exit(3);\n` },
      );
      const port = await allocateLoopbackPort();
      const started = await startApplication({ argv: ["npm", "run", "start"], cwd: directory, env: ENV, port, healthMs: 20_000 });
      expect(started).toMatchObject({ ok: false, stage: "APPLICATION_START_FAILED" });
      if (started.ok) return;
      expect(started.reason).toMatch(/exited with code/);
      expect(started.output).toMatch(/boot failed: missing configuration/);
    },
    30_000,
  );

  it(
    "stops an application that never answers when the health timeout passes",
    async () => {
      const directory = appDirectory({ start: "node idle.js" }, { "idle.js": "setInterval(() => {}, 1000);\n" });
      const port = await allocateLoopbackPort();
      const started = await startApplication({
        argv: ["npm", "run", "start"],
        cwd: directory,
        env: ENV,
        port,
        healthMs: 1_500,
      });
      expect(started).toMatchObject({ ok: false, stage: "HEALTH_CHECK_FAILED" });
      if (started.ok) return;
      expect(started.reason).toMatch(/health timeout/);
      expect(started.reason).toMatch(/stopped/);
    },
    30_000,
  );

  it(
    "runs an allowlisted build and reports its output and success",
    async () => {
      const directory = appDirectory({ build: "node build.js" }, { "build.js": `console.log("built-ok");\n` });
      const result = await runPhase({
        argv: ["npm", "run", "build"],
        cwd: directory,
        env: ENV,
        timeoutMs: 60_000,
        port: 4000,
      });
      expect(result).toMatchObject({ ok: true, timedOut: false, code: 0 });
      expect(result.output).toMatch(/built-ok/);
    },
    30_000,
  );

  it(
    "stops a phase that exceeds its time limit, marks it timed out, and never reports it as a pass",
    async () => {
      const directory = appDirectory({ build: "node slow.js" }, { "slow.js": "setTimeout(() => {}, 60000);\n" });
      const result = await runPhase({
        argv: ["npm", "run", "build"],
        cwd: directory,
        env: ENV,
        timeoutMs: 800,
        port: 4000,
      });
      expect(result).toMatchObject({ ok: false, timedOut: true });
    },
    30_000,
  );

  it("keeps the time limits explicit", () => {
    expect(APPLICATION_TIMEOUTS.healthMs).toBeGreaterThan(0);
    expect(APPLICATION_TIMEOUTS.stopGraceMs).toBeGreaterThan(0);
  });
});

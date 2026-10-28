import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";

/**
 * Starts, probes and stops the application under test. Every process the framework starts runs in its own process
 * group, so stopping it also stops any children it spawned.
 *
 * Commands are never taken from the Verification Agent. They are built here from the approved snapshot's
 * package.json, and each one must match an entry in ALLOWED_TEMPLATES exactly before it is spawned.
 */

export const APPLICATION_TIMEOUTS = {
  installMs: 600_000,
  prismaMs: 180_000,
  buildMs: 900_000,
  healthMs: 60_000,
  stopGraceMs: 5_000,
} as const;

const OUTPUT_LIMIT = 64_000;

/** Exact argv forms the framework may spawn for an application. Anything else is refused before spawning. */
export function allowedApplicationArgv(port: number): string[][] {
  return [
    ["npm", "ci", "--no-audit", "--no-fund"],
    ["npx", "--no-install", "prisma", "generate"],
    ["npx", "--no-install", "prisma", "db", "push", "--skip-generate"],
    ["npm", "run", "build"],
    ["npx", "--no-install", "next", "start", "-p", String(port), "-H", "127.0.0.1"],
    ["npm", "run", "start"],
  ];
}

export function assertAllowedArgv(argv: string[], port: number) {
  const allowed = allowedApplicationArgv(port).some(
    (template) => template.length === argv.length && template.every((token, index) => token === argv[index]),
  );
  if (!allowed) throw new Error("The command is not on the application allowlist, so it was not run.");
}

export type ApplicationPlan =
  | {
      ok: true;
      install: string[];
      prismaGenerate: string[] | null;
      prismaDbPush: string[] | null;
      build: string[] | null;
      start: string[];
      /** Next.js reads the port from its arguments; other frameworks read PORT from the environment. */
      framework: "next" | "npm-start";
    }
  | { ok: false; reason: string };

/**
 * Decides the commands for one approved snapshot. The result is fully determined by package.json, the lockfile and
 * the Prisma schema. A missing lockfile is refused, because an install that is not reproducible cannot be judged.
 */
export function planApplication(input: {
  packageJson: Record<string, unknown> | null;
  hasLockfile: boolean;
  hasPrismaSchema: boolean;
  port: number;
}): ApplicationPlan {
  if (!input.packageJson) return { ok: false, reason: "The approved snapshot has no package.json, so no application command can be determined." };
  if (!input.hasLockfile) {
    return {
      ok: false,
      reason: "The approved snapshot has no lockfile (package-lock.json), so its dependencies cannot be installed reproducibly. Commit the lockfile before running HTTP verification.",
    };
  }
  const scripts = (input.packageJson.scripts ?? {}) as Record<string, unknown>;
  const dependencies = {
    ...((input.packageJson.dependencies ?? {}) as Record<string, unknown>),
    ...((input.packageJson.devDependencies ?? {}) as Record<string, unknown>),
  };
  let start: string[];
  let framework: "next" | "npm-start";
  if ("next" in dependencies) {
    start = ["npx", "--no-install", "next", "start", "-p", String(input.port), "-H", "127.0.0.1"];
    framework = "next";
  } else if (typeof scripts.start === "string") {
    start = ["npm", "run", "start"];
    framework = "npm-start";
  } else {
    return { ok: false, reason: "The approved snapshot has no start script and is not a Next.js application, so it cannot be started for verification." };
  }
  const plan: ApplicationPlan = {
    ok: true,
    install: ["npm", "ci", "--no-audit", "--no-fund"],
    prismaGenerate: input.hasPrismaSchema ? ["npx", "--no-install", "prisma", "generate"] : null,
    prismaDbPush: input.hasPrismaSchema ? ["npx", "--no-install", "prisma", "db", "push", "--skip-generate"] : null,
    build: typeof scripts.build === "string" ? ["npm", "run", "build"] : null,
    start,
    framework,
  };
  for (const argv of [plan.install, plan.prismaGenerate, plan.prismaDbPush, plan.build, plan.start]) {
    if (argv) assertAllowedArgv(argv, input.port);
  }
  return plan;
}

/** Reads package.json and checks for the lockfile and Prisma schema. Only reads; never writes. */
export function readApplicationManifest(workspacePath: string) {
  const packagePath = path.join(workspacePath, "package.json");
  let packageJson: Record<string, unknown> | null = null;
  if (fs.existsSync(packagePath)) {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(packagePath, "utf8"));
      packageJson = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      packageJson = null;
    }
  }
  return {
    packageJson,
    hasLockfile: fs.existsSync(path.join(workspacePath, "package-lock.json")),
    hasPrismaSchema: fs.existsSync(path.join(workspacePath, "prisma", "schema.prisma")),
  };
}

/** Asks the operating system for a free port on loopback. The port is used once and never reused. */
export function allocateLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => (port > 0 ? resolve(port) : reject(new Error("No loopback port was available."))));
    });
  });
}

export type PhaseResult = { ok: boolean; timedOut: boolean; code: number | null; output: string };

/**
 * The environment is built only from allowlisted values and explicit keys, never from the builder's process.env.
 * The project types require NODE_ENV on ProcessEnv, which these maps intentionally omit, so the cast is confined here.
 */
function spawnEnvironment(env: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return env as unknown as NodeJS.ProcessEnv;
}

function appendTail(current: string, chunk: string) {
  const next = current + chunk;
  return next.length > OUTPUT_LIMIT ? next.slice(next.length - OUTPUT_LIMIT) : next;
}

function signalGroup(pid: number | undefined, signal: NodeJS.Signals) {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // The group has already exited.
  }
}

function groupAlive(pid: number | undefined) {
  if (!pid) return false;
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Runs one allowlisted command to completion, with a timeout. The whole process group is stopped on timeout. */
export function runPhase(input: {
  argv: string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
  port: number;
  /**
   * Called with the process-group id as soon as the process starts, before it is waited on. The caller records it so
   * a crash leaves a trail. If recording fails, the group is killed and the phase fails.
   */
  onStart?: (pid: number) => Promise<void>;
}): Promise<PhaseResult> {
  assertAllowedArgv(input.argv, input.port);
  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    const env = spawnEnvironment({ ...input.env });
    const child = spawn(input.argv[0] ?? "", input.argv.slice(1), {
      cwd: input.cwd,
      env,
      shell: false,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Resolution waits for the recording step, so a phase is never reported finished before its resource was recorded.
    let recorded: Promise<string | null> = Promise.resolve(null);
    if (child.pid && input.onStart) {
      const pid = child.pid;
      recorded = input.onStart(pid).then(
        () => null,
        (error: unknown) => {
          signalGroup(pid, "SIGKILL");
          return `The process could not be recorded for recovery, so it was stopped. ${error instanceof Error ? error.message : ""}`.trim();
        },
      );
    }
    const finish = (result: PhaseResult) => {
      void recorded.then((problem) => {
        if (settled) return;
        settled = true;
        resolve(problem ? { ok: false, timedOut: false, code: null, output: problem } : result);
      });
    };
    const timer = setTimeout(() => {
      signalGroup(child.pid, "SIGKILL");
      finish({ ok: false, timedOut: true, code: null, output: output + "\nThe command exceeded its time limit and was stopped." });
    }, input.timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => (output = appendTail(output, chunk.toString("utf8"))));
    child.stderr?.on("data", (chunk: Buffer) => (output = appendTail(output, chunk.toString("utf8"))));
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({ ok: false, timedOut: false, code: null, output: appendTail(output, `${error.message}\n`) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signalGroup(child.pid, "SIGKILL");
      finish({ ok: code === 0, timedOut: false, code, output });
    });
  });
}

export type ManagedApplication = {
  port: number;
  /** Process-group id of the application, for recovery after a crash. */
  pid: number;
  baseUrl: string;
  /** Output captured from the application since it started, bounded. */
  output(): string;
  /** Stops the process group and confirms nothing is left running in it. */
  stop(): Promise<{ stopped: boolean; forced: boolean }>;
};

export type StartResult =
  | { ok: true; app: ManagedApplication }
  | { ok: false; stage: "APPLICATION_START_FAILED" | "HEALTH_CHECK_FAILED"; reason: string; output: string };

/**
 * Starts the application bound to 127.0.0.1 on the given port, then waits until it answers HTTP. If it exits first,
 * the startup output is returned as the reason. If it never answers within the health timeout, it is stopped.
 */
export async function startApplication(input: {
  argv: string[];
  cwd: string;
  env: Record<string, string>;
  port: number;
  healthMs?: number;
  healthPath?: string;
  /** Called with the process-group id before the health check, so a crash leaves a trail. */
  onStart?: (pid: number) => Promise<void>;
}): Promise<StartResult> {
  assertAllowedArgv(input.argv, input.port);
  let output = "";
  let exited = false;
  let exitCode: number | null = null;
  const env = spawnEnvironment({ ...input.env, PORT: String(input.port), HOST: "127.0.0.1" });
  const child = spawn(input.argv[0] ?? "", input.argv.slice(1), {
    cwd: input.cwd,
    env,
    shell: false,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => (output = appendTail(output, chunk.toString("utf8"))));
  child.stderr?.on("data", (chunk: Buffer) => (output = appendTail(output, chunk.toString("utf8"))));
  const exitedPromise = new Promise<void>((resolve) => {
    child.on("close", (code) => {
      exited = true;
      exitCode = code;
      resolve();
    });
    child.on("error", () => {
      exited = true;
      resolve();
    });
  });

  const baseUrl = `http://127.0.0.1:${input.port}`;
  const healthPath = input.healthPath ?? "/";
  const deadline = Date.now() + (input.healthMs ?? APPLICATION_TIMEOUTS.healthMs);
  const stop = async () => {
    const stoppedGracefully = await stopGroup(child.pid, exitedPromise, APPLICATION_TIMEOUTS.stopGraceMs);
    return { stopped: !groupAlive(child.pid), forced: !stoppedGracefully };
  };
  if (child.pid && input.onStart) {
    try {
      await input.onStart(child.pid);
    } catch (error) {
      const stopped = await stop();
      return {
        ok: false,
        stage: "APPLICATION_START_FAILED",
        reason: `The application could not be recorded for recovery, so it was stopped (${stopped.stopped ? "no managed process remains" : "a managed process may remain"}). ${error instanceof Error ? error.message : ""}`.trim(),
        output,
      };
    }
  }

  while (Date.now() < deadline) {
    if (exited) {
      return {
        ok: false,
        stage: "APPLICATION_START_FAILED",
        reason: `The application exited with code ${exitCode ?? "unknown"} before it answered HTTP.`,
        output,
      };
    }
    try {
      await fetch(`${baseUrl}${healthPath}`, { redirect: "manual", signal: AbortSignal.timeout(2_000) });
      return {
        ok: true,
        app: {
          port: input.port,
          pid: child.pid ?? 0,
          baseUrl,
          output: () => output,
          stop,
        },
      };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  const stopped = await stop();
  return {
    ok: false,
    stage: "HEALTH_CHECK_FAILED",
    reason: `The application did not answer HTTP on ${baseUrl}${healthPath} within the health timeout. It was stopped (${stopped.stopped ? "no managed process remains" : "a managed process may remain"}).`,
    output,
  };
}

/** Sends SIGTERM to the group, waits for the leader to exit, then SIGKILL if it did not. */
async function stopGroup(pid: number | undefined, exited: Promise<void>, graceMs: number) {
  signalGroup(pid, "SIGTERM");
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), graceMs)),
  ]);
  if (!graceful) {
    signalGroup(pid, "SIGKILL");
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }
  // Children of the leader may outlive it briefly; sweep the group once more.
  for (let attempt = 0; attempt < 10 && groupAlive(pid); attempt += 1) {
    signalGroup(pid, "SIGKILL");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return graceful;
}

export { groupAlive };

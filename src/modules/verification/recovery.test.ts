import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { completedTaskIn, git } from "@/modules/verification/completed-task.test-support";
import { recomputeSession } from "@/modules/verification/assess";
import {
  isAttemptActive,
  markAttemptActive,
  markAttemptInactive,
  releaseRecordedResources,
  sessionResourceTracker,
} from "@/modules/verification/recovery";
import { processStartTime } from "@/modules/verification/resources";
import { getProveView, recoverInterruptedVerification, startVerification } from "@/modules/verification/service";

/**
 * Interrupted-attempt recovery. Every test runs against the builder's own database with no verification admin URL
 * configured, so nothing can reach a PostgreSQL administrator and no database is created or dropped.
 */

const products: string[] = [];
const dirs: string[] = [];
const originalAdmin = process.env.VERIFICATION_DATABASE_ADMIN_URL;
const UNUSED_PID = 2_147_483_000;

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apf-recovery-repo-"));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "recovery-fixture", scripts: { test: "node -e \"process.exit(0)\"" } }));
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "init"]);
  return dir;
}

function verificationDatabaseName() {
  return `vf_${crypto.randomBytes(12).toString("hex")}`;
}

async function interruptedSession(setup: { product: { id: string }; task: { id: string }; sha: string }, resources: unknown[]) {
  return db.verificationSession.create({
    data: {
      productId: setup.product.id,
      implementationTaskId: setup.task.id,
      commitSha: setup.sha,
      status: "EXECUTING",
      startedAt: new Date(),
      failureStage: "AGENT_EXECUTE",
      runState: { resources } as object,
    },
  });
}

beforeEach(() => {
  delete process.env.VERIFICATION_DATABASE_ADMIN_URL;
});

afterEach(async () => {
  if (originalAdmin === undefined) delete process.env.VERIFICATION_DATABASE_ADMIN_URL;
  else process.env.VERIFICATION_DATABASE_ADMIN_URL = originalAdmin;
  while (products.length > 0) {
    const id = products.pop();
    if (id) await db.product.delete({ where: { id } }).catch(() => undefined);
  }
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("recovering an interrupted verification attempt", () => {
  it("releases what the attempt recorded, keeps what it cannot release, and keeps the history", async () => {
    const setup = await completedTaskIn(makeRepo());
    products.push(setup.product.id);
    const earlier = await db.verificationSession.create({
      data: { productId: setup.product.id, implementationTaskId: setup.task.id, commitSha: setup.sha, status: "FAILED", failureClass: "AI_PROVIDER_UNAVAILABLE" },
    });
    const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "apf-verify-"));
    const database = verificationDatabaseName();
    const session = await interruptedSession(setup, [
      { id: `runtime:${runtime}`, kind: "runtime-directory", path: runtime },
      { id: `database:${database}`, kind: "database", name: database },
      { id: `application:${UNUSED_PID}`, kind: "process-group", pid: UNUSED_PID, processStart: "Mon Oct 27 10:00:00 2026", label: "The managed application" },
    ]);

    const recovered = await recoverInterruptedVerification(setup.product.id, session.id, { actorName: "Local user" });

    expect(recovered?.status).toBe("FAILED");
    expect(recovered?.failureClass).toBe("VERIFICATION_INTERRUPTED");
    expect(recovered?.failureDetail).toMatch(/not dropped because VERIFICATION_DATABASE_ADMIN_URL is not configured/);
    expect(fs.existsSync(runtime)).toBe(false);

    const stored = await db.verificationSession.findUniqueOrThrow({ where: { id: session.id } });
    const kept = (stored.runState as { resources: { id: string }[] }).resources.map((item) => item.id);
    expect(kept).toEqual([`database:${database}`]);
    expect((stored.runState as { recovery?: { recoveredBy: string } }).recovery?.recoveredBy).toBe("Local user");

    // Nothing is deleted: the earlier attempt and this one both remain.
    expect(await db.verificationSession.count({ where: { productId: setup.product.id } })).toBe(2);
    expect(await db.verificationSession.findUnique({ where: { id: earlier.id } })).not.toBeNull();

    const view = await getProveView(setup.product.id);
    expect(view?.sessions.find((item) => item.id === session.id)?.interrupted).toBe(false);
  });

  it("refuses to recover an attempt that this server is still running", async () => {
    const setup = await completedTaskIn(makeRepo());
    products.push(setup.product.id);
    const session = await interruptedSession(setup, []);
    markAttemptActive(session.id);
    try {
      expect(isAttemptActive(session.id)).toBe(true);
      await expect(recoverInterruptedVerification(setup.product.id, session.id, { actorName: "Local user" })).rejects.toThrow(
        /still running in this server/,
      );
      const view = await getProveView(setup.product.id);
      expect(view?.sessions.find((item) => item.id === session.id)?.interrupted).toBe(false);
    } finally {
      markAttemptInactive(session.id);
    }
  });

  it("refuses recovery by the Verification Agent, which may not decide anything", async () => {
    const setup = await completedTaskIn(makeRepo());
    products.push(setup.product.id);
    const session = await interruptedSession(setup, []);
    await expect(recoverInterruptedVerification(setup.product.id, session.id, { actorName: "Testing Agent" })).rejects.toThrow(/cannot approve/);
    expect((await db.verificationSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe("EXECUTING");
  });

  it("blocks a new attempt while an interrupted one is unrecovered, and reports the interruption to the person", async () => {
    const setup = await completedTaskIn(makeRepo());
    products.push(setup.product.id);
    const session = await interruptedSession(setup, []);
    const view = await getProveView(setup.product.id);
    expect(view?.sessions.find((item) => item.id === session.id)?.interrupted).toBe(true);
    await expect(startVerification(setup.product.id, setup.task.id)).rejects.toThrow(/stopped before it finished/);
  });

  it("records a snapshot change as a blocking error that is not a product failure, and keeps that class on recomputation", async () => {
    const setup = await completedTaskIn(makeRepo());
    products.push(setup.product.id);
    const session = await interruptedSession(setup, []);
    await db.verificationSession.update({ where: { id: session.id }, data: { status: "REVIEW" } });
    await db.verificationEscalation.create({
      data: {
        sessionId: session.id,
        type: "IMPLEMENTATION_CHANGE",
        description: "Verification changed files outside verification/: src/claims/submit.mjs.",
        reason: "The approved snapshot must not change during verification, so this verdict cannot judge it.",
        status: "OPEN",
      },
    });

    await recomputeSession(session.id);
    const first = await db.verificationSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(first).toMatchObject({
      status: "BLOCKED",
      overallVerdict: "INCONCLUSIVE",
      failureClass: "VERIFICATION_SNAPSHOT_MISMATCH",
      failureStage: "AGENT_EXECUTE",
    });
    expect(first.failureDetail).toMatch(/src\/claims\/submit\.mjs/);

    await recomputeSession(session.id);
    const second = await db.verificationSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(second.failureClass).toBe("VERIFICATION_SNAPSHOT_MISMATCH");
    expect(second.overallVerdict).toBe("INCONCLUSIVE");
  });

  it("releases only what is provably safe to release", async () => {
    const outcome = await releaseRecordedResources([
      { id: "database:ai_product_factory", kind: "database", name: "ai_product_factory" },
      { id: "runtime:/etc", kind: "runtime-directory", path: "/etc" },
      { id: `application:${UNUSED_PID}`, kind: "process-group", pid: UNUSED_PID, processStart: "", label: "The managed application" },
    ]);
    expect(outcome.released.map((item) => item.id)).toEqual([`application:${UNUSED_PID}`]);
    expect(outcome.kept.map((item) => item.id)).toEqual(["database:ai_product_factory", "runtime:/etc"]);
    expect(outcome.notes.join(" ")).toMatch(/not a verification name/);
    expect(fs.existsSync("/etc")).toBe(true);
  });

  it("records and releases temporary resources on the session as they are created and removed", async () => {
    const setup = await completedTaskIn(makeRepo());
    products.push(setup.product.id);
    const session = await interruptedSession(setup, []);
    const tracker = sessionResourceTracker(session.id);
    const name = verificationDatabaseName();
    await tracker.record({ id: `database:${name}`, kind: "database", name });
    await tracker.record({ id: "runtime:x", kind: "runtime-directory", path: path.join(os.tmpdir(), "apf-verify-x") });
    await tracker.release("runtime:x");
    const stored = await db.verificationSession.findUniqueOrThrow({ where: { id: session.id } });
    expect((stored.runState as { resources: { id: string }[] }).resources.map((item) => item.id)).toEqual([`database:${name}`]);
  });

  it("reads a process start time for a live process and none for a missing one", () => {
    expect(processStartTime(process.pid)).toEqual(expect.any(String));
    expect(processStartTime(UNUSED_PID)).toBeNull();
  });
});

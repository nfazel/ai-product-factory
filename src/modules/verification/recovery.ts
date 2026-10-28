import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { db } from "@/lib/db";
import { groupAlive } from "@/modules/verification/http/lifecycle";
import { dropOrphanedVerificationDatabase, VERIFICATION_DATABASE_PATTERN } from "@/modules/verification/http/database";
import { verificationDatabaseAdminUrl } from "@/modules/verification/http/config";
import { parseTrackedResources, processStartTime, type ResourceTracker, type TrackedResource } from "@/modules/verification/resources";

/**
 * Crash safety for Independent Verification.
 *
 * - An in-process registry of attempts this server is running. A session marked running but absent from the registry
 *   was interrupted (the server stopped mid-run). Registry state lives on globalThis so hot reloads keep it.
 * - A database-backed tracker that records each temporary resource on the session's runState as it is created.
 * - Release logic that a person triggers explicitly for an interrupted attempt. Nothing here runs automatically.
 */

const REGISTRY_KEY = "__aiProductFactoryActiveVerificationAttempts";

function activeAttempts(): Set<string> {
  const scope = globalThis as unknown as Record<string, unknown>;
  if (!(scope[REGISTRY_KEY] instanceof Set)) scope[REGISTRY_KEY] = new Set<string>();
  return scope[REGISTRY_KEY] as Set<string>;
}

export function markAttemptActive(sessionId: string) {
  activeAttempts().add(sessionId);
}

export function markAttemptInactive(sessionId: string) {
  activeAttempts().delete(sessionId);
}

export function isAttemptActive(sessionId: string) {
  return activeAttempts().has(sessionId);
}

export function sessionResourceTracker(sessionId: string): ResourceTracker {
  return {
    async record(resource) {
      await updateResources(sessionId, (list) => [...list.filter((item) => item.id !== resource.id), resource]);
    },
    async release(id) {
      await updateResources(sessionId, (list) => list.filter((item) => item.id !== id));
    },
  };
}

async function updateResources(sessionId: string, change: (list: TrackedResource[]) => TrackedResource[]) {
  const row = await db.verificationSession.findUnique({ where: { id: sessionId }, select: { runState: true } });
  const state = recordOf(row?.runState);
  const resources = change(parseTrackedResources(state.resources));
  await db.verificationSession.update({
    where: { id: sessionId },
    data: { runState: { ...state, resources } as unknown as object },
  });
}

export function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** The builder database name, read only so it can be refused as a target. It is never used to connect. */
export function builderDatabaseNames(env: Record<string, string | undefined> = process.env): string[] {
  const names = ["ai_product_factory"];
  const value = env.DATABASE_URL?.trim();
  if (value) {
    try {
      const name = decodeURIComponent(new URL(value).pathname.replace(/^\//, ""));
      if (name) names.push(name);
    } catch {
      // An unparsable URL contributes no name; the fixed name above still applies.
    }
  }
  return names;
}

export type ReleaseOutcome = {
  /** Resources that were cleaned up or confirmed gone. */
  released: TrackedResource[];
  /** Resources that remain. They stay on the session so a person can see and clean them up. */
  kept: TrackedResource[];
  /** Plain-language notes, free of secrets, describing each decision. */
  notes: string[];
};

const PROCESS_GRACE_MS = 3_000;

/**
 * Releases what an interrupted attempt left behind. Every step is checked: a database is dropped only if its name is a
 * verification name; a directory is removed only under the system temp directory with the framework's prefix; a
 * process group is signalled only if the same process (same start time) still owns that pid.
 */
export async function releaseRecordedResources(
  resources: TrackedResource[],
  env: Record<string, string | undefined> = process.env,
): Promise<ReleaseOutcome> {
  const outcome: ReleaseOutcome = { released: [], kept: [], notes: [] };
  const adminUrl = verificationDatabaseAdminUrl(env);
  for (const resource of resources) {
    const result = await releaseOne(resource, adminUrl, env);
    if (result.released) outcome.released.push(resource);
    else outcome.kept.push(resource);
    if (result.note) outcome.notes.push(result.note);
  }
  return outcome;
}

async function releaseOne(
  resource: TrackedResource,
  adminUrl: string | null,
  env: Record<string, string | undefined>,
): Promise<{ released: boolean; note: string }> {
  if (resource.kind === "database") {
    if (!VERIFICATION_DATABASE_PATTERN.test(resource.name)) {
      return { released: false, note: "A recorded database name was not a verification name, so it was not touched." };
    }
    if (!adminUrl) {
      return { released: false, note: `Database ${resource.name} was not dropped because VERIFICATION_DATABASE_ADMIN_URL is not configured.` };
    }
    const dropped = await dropOrphanedVerificationDatabase({
      adminUrl,
      name: resource.name,
      forbiddenNames: builderDatabaseNames(env),
      env,
    });
    return dropped.dropped
      ? { released: true, note: `Dropped verification database ${resource.name}.` }
      : { released: false, note: `Database ${resource.name} was not dropped. ${dropped.reason}` };
  }

  if (resource.kind === "runtime-directory") {
    const target = path.resolve(resource.path);
    const roots = [os.tmpdir(), fs.realpathSync(os.tmpdir())].map((root) => path.resolve(root) + path.sep);
    const inside = roots.some((root) => target.startsWith(root));
    if (!inside || !path.basename(target).startsWith("apf-verify-")) {
      return { released: false, note: "A recorded runtime directory was outside the verification area, so it was not removed." };
    }
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    return { released: true, note: "Removed the verification runtime directory." };
  }

  // process-group
  const current = processStartTime(resource.pid);
  if (current === null) {
    if (groupAlive(resource.pid)) {
      return { released: false, note: `${resource.label} leader has exited but its group still has members. It was not signalled.` };
    }
    return { released: true, note: `${resource.label} is no longer running.` };
  }
  if (!resource.processStart) {
    return { released: false, note: `${resource.label} was recorded without a start time, so it was not signalled.` };
  }
  if (current !== resource.processStart) {
    return { released: true, note: `${resource.label} pid was reused by another process. The other process was not signalled.` };
  }
  await terminateGroup(resource.pid);
  return groupAlive(resource.pid)
    ? { released: false, note: `${resource.label} is still running and could not be stopped.` }
    : { released: true, note: `Stopped ${resource.label}.` };
}

async function terminateGroup(pid: number) {
  signal(pid, "SIGTERM");
  const deadline = Date.now() + PROCESS_GRACE_MS;
  while (Date.now() < deadline && groupAlive(pid)) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (groupAlive(pid)) {
    signal(pid, "SIGKILL");
    const killDeadline = Date.now() + 2_000;
    while (Date.now() < killDeadline && groupAlive(pid)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

function signal(pid: number, value: NodeJS.Signals) {
  try {
    process.kill(-pid, value);
  } catch {
    // The group has already exited.
  }
}

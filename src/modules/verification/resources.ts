import { spawnSync } from "node:child_process";

/**
 * Temporary resources one verification attempt creates. They are recorded on the session as they are created and
 * removed when they are released, so a crash leaves a list of what must be cleaned up. Nothing here stores a
 * connection string or a secret: a database is recorded by name only.
 */
export type TrackedResource =
  | { id: string; kind: "container" | "network"; name: string; job: string }
  | { id: string; kind: "database"; name: string }
  | { id: string; kind: "runtime-directory"; path: string }
  | { id: string; kind: "process-group"; pid: number; processStart: string; label: string };

export type ResourceTracker = {
  record(resource: TrackedResource): Promise<void>;
  release(id: string): Promise<void>;
};

export const NO_RESOURCE_TRACKER: ResourceTracker = {
  async record() {},
  async release() {},
};

/**
 * The start time of a process as reported by the operating system. It identifies a process better than its pid,
 * because pids are reused. Null when no process has that pid.
 */
export function processStartTime(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const result = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const value = result.stdout.trim();
  return value.length > 0 ? value : null;
}

/** Recovery may touch only named resources inside this exact job namespace. */
export function isContainerResourceName(kind: string, name: string, job: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(job)) return false;
  if (name === 'apf-verification-active-job') return kind === 'container';
  const prefix = `apf-vf-${job}-`;
  if (!name.startsWith(prefix)) return false;
  const suffix = name.slice(prefix.length);
  return kind === 'container' ? ['build','app','test','database','artifacts','schema','proxy','snapshot'].includes(suffix)
    : kind === 'network' && ['dependencies','application','database','tests','test-database'].includes(suffix);
}

/** Reads the resource list from stored JSON, dropping anything that is not a well-formed record. */
export function parseTrackedResources(value: unknown): TrackedResource[] {
  if (!Array.isArray(value)) return [];
  const resources: TrackedResource[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string") continue;
    if ((record.kind === "container" || record.kind === "network") && typeof record.name === "string" && typeof record.job === "string" && isContainerResourceName(record.kind, record.name, record.job)) {
      resources.push({ id: record.id, kind: record.kind, name: record.name, job: record.job });
    } else if (record.kind === "database" && typeof record.name === "string") {
      resources.push({ id: record.id, kind: "database", name: record.name });
    } else if (record.kind === "runtime-directory" && typeof record.path === "string") {
      resources.push({ id: record.id, kind: "runtime-directory", path: record.path });
    } else if (
      record.kind === "process-group" &&
      typeof record.pid === "number" &&
      typeof record.processStart === "string" &&
      typeof record.label === "string"
    ) {
      resources.push({ id: record.id, kind: "process-group", pid: record.pid, processStart: record.processStart, label: record.label });
    }
  }
  return resources;
}

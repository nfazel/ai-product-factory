import type { ImplementationProfile } from "@/modules/verification/inspection";
import { httpBlackboxAdapter } from "@/modules/verification/adapters/http-blackbox";
import { nodeTestMjsAdapter } from "@/modules/verification/adapters/node-test-mjs";
import { TEST_SURFACES, type TestAdapter, type TestSurface } from "@/modules/verification/adapters/types";

/** What the Verification Agent is told about one adapter for one implementation. */
export type CapabilityReport = {
  adapterId: string;
  label: string;
  surfaces: TestSurface[];
  provides: string[];
  fileConvention: string;
  commandTemplate: string;
  environment: string[];
  setupRequired: boolean;
  canGenerate: boolean;
  canExecute: boolean;
  available: boolean;
  reason: string;
};

/** A verification requirement that no registered adapter can execute. It is reported, never silently skipped. */
export type UnsupportedRequirement = { requirement: string; reason: string };

/**
 * UNAVAILABLE: the adapter fits the case but cannot run for this implementation (for example no JavaScript modules).
 * REFUSED: the adapter does not fit the case, or the proposal named something the framework does not allow.
 */
export type AdapterSelection =
  | { ok: true; adapter: TestAdapter }
  | { ok: false; kind: "UNAVAILABLE" | "REFUSED"; reason: string };

export type SelectionRequest = {
  /** The adapter the Verification Agent proposed. Empty lets the framework choose deterministically. */
  adapterId: string;
  surface: TestSurface | string;
  filePath: string;
  requiredCapabilities: string[];
  profile: ImplementationProfile;
};

export type AdapterRegistry = {
  register(adapter: TestAdapter): void;
  get(id: string): TestAdapter | undefined;
  list(): TestAdapter[];
  capabilities(profile: ImplementationProfile): CapabilityReport[];
  unsupported(profile: ImplementationProfile): UnsupportedRequirement[];
  select(request: SelectionRequest): AdapterSelection;
};

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validateAdapter(adapter: TestAdapter) {
  if (!ID_PATTERN.test(adapter.id)) {
    throw new Error(`Adapter id "${adapter.id}" must be lowercase words joined by hyphens.`);
  }
  if (adapter.surfaces.length === 0) throw new Error(`Adapter ${adapter.id} must declare at least one surface.`);
  for (const surface of adapter.surfaces) {
    if (!(TEST_SURFACES as readonly string[]).includes(surface)) {
      throw new Error(`Adapter ${adapter.id} declares an unknown surface ${surface}.`);
    }
  }
  if (adapter.technologies.length === 0) throw new Error(`Adapter ${adapter.id} must declare its technology.`);
  if (adapter.canExecute && adapter.provides.length === 0) {
    throw new Error(`Adapter ${adapter.id} can execute tests but provides no capabilities.`);
  }
}

/** Refusal reason for one adapter and one request, or null when the adapter fits and is available. */
function fitness(
  adapter: TestAdapter,
  request: SelectionRequest,
): { kind: "UNAVAILABLE" | "REFUSED"; reason: string } | null {
  if (!adapter.canGenerate) return { kind: "REFUSED", reason: `${adapter.id} cannot generate verification tests.` };
  if (!(adapter.surfaces as string[]).includes(request.surface)) {
    return { kind: "REFUSED", reason: `${adapter.id} does not exercise the ${request.surface} surface.` };
  }
  if (!adapter.acceptsFile(request.filePath)) {
    return {
      kind: "REFUSED",
      reason: `${adapter.id} runs only ${adapter.fileConvention} files, so ${request.filePath || "an empty path"} cannot be run by it.`,
    };
  }
  const missing = request.requiredCapabilities.filter((item) => !adapter.provides.includes(item));
  if (missing.length > 0) {
    return { kind: "REFUSED", reason: `The case needs ${missing.join(", ")}, which ${adapter.id} does not provide.` };
  }
  const availability = adapter.canExecute
    ? adapter.detect(request.profile)
    : { available: false, reason: `${adapter.id} can generate test cases but cannot execute them.` };
  if (!availability.available) return { kind: "UNAVAILABLE", reason: availability.reason };
  return null;
}

export function createAdapterRegistry(adapters: TestAdapter[] = []): AdapterRegistry {
  const byId = new Map<string, TestAdapter>();
  // Sorted by id so that selection never depends on registration order.
  const sorted = () => [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));

  const registry: AdapterRegistry = {
    register(adapter) {
      validateAdapter(adapter);
      if (byId.has(adapter.id)) throw new Error(`Adapter ${adapter.id} is already registered.`);
      byId.set(adapter.id, adapter);
    },

    get(id) {
      return byId.get(id);
    },

    list() {
      return sorted();
    },

    capabilities(profile) {
      // A capability report describes the adapter for this implementation, not for one particular case.
      return sorted().map((adapter): CapabilityReport => {
        const availability = adapter.canExecute
          ? adapter.detect(profile)
          : { available: false, reason: `${adapter.id} can generate test cases but cannot execute them.` };
        return {
          adapterId: adapter.id,
          label: adapter.label,
          surfaces: [...adapter.surfaces],
          provides: [...adapter.provides],
          fileConvention: adapter.fileConvention,
          commandTemplate: adapter.commandTemplate,
          environment: [...adapter.environment],
          setupRequired: adapter.setupRequired,
          canGenerate: adapter.canGenerate,
          canExecute: adapter.canExecute,
          available: availability.available,
          reason: availability.reason,
        };
      });
    },

    unsupported(profile) {
      const items: UnsupportedRequirement[] = [];
      if (profile.typeScriptSources > 0 || profile.typescript) {
        items.push({
          requirement: "TypeScript or JSX product modules",
          reason:
            "No registered adapter can load .ts, .tsx or .jsx modules, and verification does not transpile them. Tests of these modules need a TypeScript-capable adapter.",
        });
      }
      for (const runner of profile.testRunners) {
        items.push({
          requirement: `The project's ${runner} test runner`,
          reason: `No registered adapter runs ${runner}. Verification does not execute project test runners.`,
        });
      }
      const covered = new Set(sorted().flatMap((adapter) => adapter.surfaces));
      const uncovered = TEST_SURFACES.filter((surface) => !covered.has(surface));
      if (uncovered.length > 0) {
        items.push({
          requirement: `Test surfaces: ${uncovered.join(", ")}`,
          reason: "No registered adapter exercises these surfaces, so a case for them must be verified by a person.",
        });
      }
      return items;
    },

    select(request) {
      const requested = request.adapterId.trim();
      if (requested) {
        // An explicit proposal is never swapped for another adapter. It is either used or refused.
        const adapter = byId.get(requested);
        if (!adapter) {
          return { ok: false, kind: "REFUSED", reason: `The adapter ${requested} is not registered, so it cannot run this case.` };
        }
        const failure = fitness(adapter, request);
        return failure ? { ok: false, ...failure } : { ok: true, adapter };
      }
      const failures: { kind: "UNAVAILABLE" | "REFUSED"; reason: string }[] = [];
      for (const adapter of sorted()) {
        const failure = fitness(adapter, request);
        if (!failure) return { ok: true, adapter };
        failures.push(failure);
      }
      if (failures.length === 0) return { ok: false, kind: "REFUSED", reason: "No test adapter is registered." };
      // An adapter that fits the case but cannot run here decides the reason. Adapters for other surfaces or file
      // conventions are not candidates, so their refusals must not hide the real cause.
      const unavailable = failures.filter((item) => item.kind === "UNAVAILABLE");
      if (unavailable.length > 0) {
        return { ok: false, kind: "UNAVAILABLE", reason: unavailable.map((item) => item.reason).join(" ") };
      }
      return { ok: false, kind: "REFUSED", reason: failures.map((item) => item.reason).join(" ") };
    },
  };

  for (const adapter of adapters) registry.register(adapter);
  return registry;
}

/** The adapters this build of the Verification Agent can use. Adding one is a registration, not a rewrite. */
export const verificationAdapters = createAdapterRegistry([nodeTestMjsAdapter, httpBlackboxAdapter]);

/** Test cases and executions recorded before adapters existed carry an empty adapter id and ran node:test. */
export const LEGACY_ADAPTER_ID = "node-test-mjs";

/**
 * Whether a recorded passing execution may satisfy a criterion. Records made with an adapter must come from an
 * adapter that can execute, and from the approved snapshot. Records made before adapters are judged by the
 * command they ran, as they were before, and are not invalidated.
 *
 * An HTTP black-box pass also needs observed requests. A pass with no request to the application is missing
 * evidence, not verification.
 */
export function executionIsCredible(
  record: { adapterId: string; command: string; snapshotCommit: string; observationCount?: number },
  approvedSnapshot: string,
) {
  if (record.adapterId === "") return record.command.startsWith("node --test verification/");
  const adapter = verificationAdapters.get(record.adapterId);
  if (!adapter?.canExecute) return false;
  if (approvedSnapshot === "" || record.snapshotCommit !== approvedSnapshot) return false;
  if (record.adapterId === "http-blackbox") return (record.observationCount ?? 0) > 0;
  return true;
}

import { describe, expect, it } from "vitest";

import {
  createAdapterRegistry,
  executionIsCredible,
  verificationAdapters,
} from "@/modules/verification/adapters/registry";
import { nodeTestMjsAdapter } from "@/modules/verification/adapters/node-test-mjs";
import type { TestAdapter } from "@/modules/verification/adapters/types";
import type { ImplementationProfile } from "@/modules/verification/inspection";

function profile(overrides: Partial<ImplementationProfile> = {}): ImplementationProfile {
  return {
    packageManager: "npm",
    typescript: false,
    frameworks: [],
    testRunners: [],
    scripts: [],
    dependencies: [],
    routes: [],
    components: [],
    existingTests: [],
    plainJavaScriptSources: 1,
    typeScriptSources: 0,
    ...overrides,
  };
}

const JAVASCRIPT = profile();
const TYPESCRIPT_ONLY = profile({ typescript: true, plainJavaScriptSources: 0, typeScriptSources: 3 });

/** A stand-in adapter used only to test the contract. It is never registered in the default registry. */
function fakeAdapter(id: string, overrides: Partial<TestAdapter> = {}): TestAdapter {
  return {
    id,
    label: `${id} test adapter`,
    technologies: [{ runtime: "test", language: "test" }],
    surfaces: ["HTTP_ENDPOINT"],
    provides: ["fake-runner"],
    requiredDependencies: [],
    fileConvention: "verification/<name>.test.ts",
    commandTemplate: "fake <filePath>",
    environment: ["A fake runner"],
    setupRequired: false,
    canGenerate: true,
    canExecute: true,
    detect: () => ({ available: true, reason: "Fake runner is present." }),
    acceptsFile: (filePath) => filePath.startsWith("verification/") && filePath.endsWith(".test.ts"),
    commandFor: (filePath) => `fake ${filePath}`,
    classify: () => ({
      category: "PASSED",
      status: "PASSED",
      reason: "ok",
      counts: { tests: 1, passed: 1, failed: 0, skipped: 0, reported: true },
    }),
    ...overrides,
  };
}

const request = (overrides: Partial<Parameters<typeof verificationAdapters.select>[0]> = {}) => ({
  adapterId: "",
  surface: "MODULE_EXPORT",
  filePath: "verification/claim/submit.test.mjs",
  requiredCapabilities: [],
  profile: JAVASCRIPT,
  ...overrides,
});

describe("adapter registration", () => {
  it("registers the node-test-mjs adapter in the default registry", () => {
    expect(verificationAdapters.get("node-test-mjs")).toBe(nodeTestMjsAdapter);
    expect(verificationAdapters.list().map((item) => item.id)).toEqual(["http-blackbox", "node-test-mjs"]);
  });

  it("rejects a duplicate adapter id", () => {
    const registry = createAdapterRegistry([fakeAdapter("fake-runner")]);
    expect(() => registry.register(fakeAdapter("fake-runner"))).toThrow(/already registered/);
  });

  it("rejects an invalid id, an unknown surface, and an executable adapter that provides nothing", () => {
    const registry = createAdapterRegistry();
    expect(() => registry.register(fakeAdapter("Not Valid"))).toThrow(/lowercase words/);
    expect(() => registry.register(fakeAdapter("bad-surface", { surfaces: ["MOON" as never] }))).toThrow(/unknown surface/);
    expect(() => registry.register(fakeAdapter("no-provides", { provides: [] }))).toThrow(/provides no capabilities/);
  });

  it("lists adapters in id order, so selection never depends on registration order", () => {
    const registry = createAdapterRegistry([fakeAdapter("zeta"), fakeAdapter("alpha")]);
    expect(registry.list().map((item) => item.id)).toEqual(["alpha", "zeta"]);
  });
});

describe("capability detection", () => {
  it("reports node-test-mjs as available for plain JavaScript and unavailable for TypeScript-only projects", () => {
    expect(verificationAdapters.capabilities(JAVASCRIPT).find((item) => item.adapterId === "node-test-mjs")).toMatchObject({
      adapterId: "node-test-mjs",
      available: true,
    });
    const unavailable = verificationAdapters.capabilities(TYPESCRIPT_ONLY).find((item) => item.adapterId === "node-test-mjs");
    expect(unavailable).toMatchObject({ adapterId: "node-test-mjs", available: false });
    expect(unavailable?.reason).toMatch(/cannot load TypeScript or JSX/);
  });

  it("never reports an adapter that cannot execute as available", () => {
    const registry = createAdapterRegistry([fakeAdapter("generate-only", { canExecute: false })]);
    const [report] = registry.capabilities(JAVASCRIPT);
    expect(report?.available).toBe(false);
    expect(report?.canGenerate).toBe(true);
  });

  it("reports unsupported requirements instead of silently skipping them", () => {
    const unsupported = verificationAdapters.unsupported(
      profile({ typescript: true, typeScriptSources: 2, testRunners: ["Vitest"], plainJavaScriptSources: 1 }),
    );
    expect(unsupported.map((item) => item.requirement)).toEqual(
      expect.arrayContaining([
        "TypeScript or JSX product modules",
        "The project's Vitest test runner",
        "Test surfaces: DATABASE, BROWSER_UI, OTHER",
      ]),
    );
    expect(unsupported.some((item) => item.requirement.includes("MODULE_EXPORT"))).toBe(false);
  });
});

describe("selection", () => {
  it("selects the compatible adapter deterministically when the agent names none", () => {
    const registry = createAdapterRegistry([fakeAdapter("zeta", { surfaces: ["MODULE_EXPORT"], acceptsFile: () => true }), nodeTestMjsAdapter]);
    const first = registry.select(request());
    const second = registry.select(request());
    expect(first.ok && first.adapter.id).toBe("node-test-mjs");
    expect(second).toEqual(first);
  });

  it("uses the adapter the agent names when it is compatible", () => {
    const selection = verificationAdapters.select(request({ adapterId: "node-test-mjs" }));
    expect(selection.ok && selection.adapter.id).toBe("node-test-mjs");
  });

  it("refuses an unregistered adapter instead of substituting another", () => {
    const selection = verificationAdapters.select(request({ adapterId: "vitest" }));
    expect(selection).toMatchObject({ ok: false, kind: "REFUSED" });
    expect(selection.ok === false && selection.reason).toMatch(/not registered/);
  });

  it("refuses a surface no registered adapter exercises", () => {
    const selection = verificationAdapters.select(request({ surface: "DATABASE" }));
    expect(selection).toMatchObject({ ok: false, kind: "REFUSED" });
  });

  it("refuses a file outside the adapter's convention", () => {
    const selection = verificationAdapters.select(request({ filePath: "src/claims/submit.test.mjs" }));
    expect(selection).toMatchObject({ ok: false, kind: "REFUSED" });
    expect(selection.ok === false && selection.reason).toMatch(/verification\/<name>\.test\.mjs/);
  });

  it("refuses a case that requires a capability the adapter does not provide", () => {
    const selection = verificationAdapters.select(request({ requiredCapabilities: ["node-test-runner", "browser-session"] }));
    expect(selection).toMatchObject({ ok: false, kind: "REFUSED" });
    expect(selection.ok === false && selection.reason).toMatch(/browser-session/);
  });

  it("accepts a case whose required capabilities the adapter provides", () => {
    const selection = verificationAdapters.select(request({ requiredCapabilities: ["node-test-runner", "assertion-result"] }));
    expect(selection.ok).toBe(true);
  });

  it("never selects an unavailable adapter, and says it is unavailable", () => {
    const selection = verificationAdapters.select(request({ profile: TYPESCRIPT_ONLY }));
    expect(selection).toMatchObject({ ok: false, kind: "UNAVAILABLE" });
    expect(selection.ok === false && selection.reason).toMatch(/cannot load TypeScript or JSX/);
  });

  it("reports a named adapter that is unavailable as unavailable rather than substituting it", () => {
    const selection = verificationAdapters.select(request({ adapterId: "node-test-mjs", profile: TYPESCRIPT_ONLY }));
    expect(selection).toMatchObject({ ok: false, kind: "UNAVAILABLE" });
  });

  it("never selects an adapter that cannot generate tests", () => {
    const registry = createAdapterRegistry([fakeAdapter("reader", { canGenerate: false, surfaces: ["MODULE_EXPORT"], acceptsFile: () => true })]);
    expect(registry.select(request())).toMatchObject({ ok: false, kind: "REFUSED" });
  });
});

describe("execution credibility", () => {
  const SNAPSHOT = "a".repeat(40);
  const NODE_COMMAND = "node --test verification/claim/submit.test.mjs";

  it("keeps records made before adapters judged by the command they ran", () => {
    expect(executionIsCredible({ adapterId: "", command: NODE_COMMAND, snapshotCommit: "" }, SNAPSHOT)).toBe(true);
    expect(executionIsCredible({ adapterId: "", command: "npm test", snapshotCommit: "" }, SNAPSHOT)).toBe(false);
  });

  it("requires an adapter-recorded execution to match the approved snapshot", () => {
    expect(executionIsCredible({ adapterId: "node-test-mjs", command: NODE_COMMAND, snapshotCommit: SNAPSHOT }, SNAPSHOT)).toBe(true);
    expect(executionIsCredible({ adapterId: "node-test-mjs", command: NODE_COMMAND, snapshotCommit: "b".repeat(40) }, SNAPSHOT)).toBe(false);
    expect(executionIsCredible({ adapterId: "node-test-mjs", command: NODE_COMMAND, snapshotCommit: "" }, SNAPSHOT)).toBe(false);
  });

  it("does not credit an execution from an unknown or non-executing adapter", () => {
    expect(executionIsCredible({ adapterId: "vitest", command: "vitest run", snapshotCommit: SNAPSHOT }, SNAPSHOT)).toBe(false);
    expect(executionIsCredible({ adapterId: "node-test-mjs", command: NODE_COMMAND, snapshotCommit: SNAPSHOT }, "")).toBe(false);
  });
});

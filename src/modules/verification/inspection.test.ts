import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  executionCapabilities,
  inspectImplementation,
  INSPECTION_LIMITS,
  notExecutableItems,
} from "@/modules/verification/inspection";

const temporary: string[] = [];

function project(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apf-inspect-"));
  temporary.push(root);
  for (const [relative, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), content);
  }
  return root;
}

afterEach(() => {
  while (temporary.length > 0) {
    const item = temporary.pop();
    if (item) fs.rmSync(item, { recursive: true, force: true });
  }
});

const PACKAGE = JSON.stringify({
  name: "find-a-friend-like",
  scripts: { dev: "next dev", build: "next build", test: "node --test" },
  dependencies: { next: "14.2.3", react: "18.3.1" },
  devDependencies: { vitest: "3.0.0", prisma: "5.22.0" },
});

const TSCONFIG = JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } });

function sampleProject(extra: Record<string, string> = {}) {
  return project({
    "package.json": PACKAGE,
    "package-lock.json": "{}",
    "tsconfig.json": TSCONFIG,
    "vitest.config.ts": "export default {};\n",
    "src/app/api/auth/login/route.ts": "export async function POST() { return new Response(\"ok\"); }\n",
    "src/app/api/discovery/feed/route.ts": "export async function GET() { return new Response(\"[]\"); }\n",
    "src/app/(shop)/api/items/[id]/route.ts": "export async function GET() { return new Response(\"item\"); }\n",
    "src/app/discovery/page.tsx": "export default function Page() { return null; }\n",
    "src/components/claim-form.tsx": "import { formatDate } from \"@/lib/format\";\nexport function ClaimForm() { return formatDate(new Date()); }\n",
    "src/lib/format.ts": "export function formatDate(value: Date) { return value.toISOString(); }\n",
    "src/claims/submit.mjs": "import { helper } from \"./helper.mjs\";\nexport function submitClaim() { return helper(); }\n",
    "src/claims/helper.mjs": "export function helper() { return { reference: \"CLM-1001\" }; }\n",
    "src/claims/submit.test.ts": "test(\"notice\", () => {});\n",
    "src/legacy/old.jsx": "export const Old = () => null;\n",
    "src/legacy/old.js": "export const oldValue = 1;\n",
    "src/deep/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/deep.ts": "export const deepValue = \"reached\";\n",
    "src/secrets/key.ts": "export const apiKey = \"sk-live-should-not-be-read\";\n",
    "node_modules/pkg/index.js": "module.exports = {};\n",
    "verification/old/claim.test.mjs": "// earlier verification artefact\n",
    ...extra,
  });
}

describe("inspectImplementation: discovery", () => {
  it("discovers routes at any depth, including route groups and dynamic segments", () => {
    const inspection = inspectImplementation({ workspacePath: sampleProject() });
    const urls = inspection.profile.routes.map((route) => route.url).sort();
    expect(urls).toEqual(["/api/auth/login", "/api/discovery/feed", "/api/items/[id]"]);
  });

  it("inspects TSX and JSX components", () => {
    const inspection = inspectImplementation({ workspacePath: sampleProject() });
    expect(inspection.profile.components).toEqual(expect.arrayContaining(["src/components/claim-form.tsx", "src/app/discovery/page.tsx", "src/legacy/old.jsx"]));
    expect(inspection.context).toContain("export function ClaimForm()");
  });

  it("supports .ts, .tsx, .js and .jsx files in the manifest", () => {
    const manifest = inspectImplementation({ workspacePath: sampleProject() }).manifest.map((entry) => entry.path);
    for (const extension of [".ts", ".tsx", ".js", ".jsx", ".mjs"]) {
      expect(manifest.some((item) => item.endsWith(extension))).toBe(true);
    }
  });

  it("applies no fixed directory-depth limit", () => {
    const inspection = inspectImplementation({ workspacePath: sampleProject() });
    const deep = inspection.manifest.find((entry) => entry.path.endsWith("deep.ts"));
    expect(deep?.included).toBe(true);
    expect(inspection.context).toContain("export const deepValue");
  });

  it("excludes dependencies, previous verification artefacts and build output", () => {
    const manifest = inspectImplementation({ workspacePath: sampleProject() }).manifest.map((entry) => entry.path);
    expect(manifest.some((item) => item.startsWith("node_modules/"))).toBe(false);
    expect(manifest.some((item) => item.startsWith("verification/"))).toBe(false);
  });

  it("identifies configuration, package manager, frameworks and test runners", () => {
    const { profile } = inspectImplementation({ workspacePath: sampleProject() });
    expect(profile.typescript).toBe(true);
    expect(profile.packageManager).toBe("npm");
    expect(profile.frameworks).toEqual(expect.arrayContaining(["Next.js", "React", "Prisma"]));
    expect(profile.testRunners).toContain("Vitest");
    expect(profile.scripts).toEqual(["build", "dev", "test"]);
  });
});

describe("inspectImplementation: changed files and imports", () => {
  it("inspects every changed file that exists and reports the ones it cannot", () => {
    const inspection = inspectImplementation({
      workspacePath: sampleProject(),
      changedFiles: ["src/claims/submit.mjs", "../escape.ts", "src/missing.ts"],
    });
    expect(inspection.changedFiles.accepted).toEqual(["src/claims/submit.mjs"]);
    expect(inspection.changedFiles.missing.map((item) => item.path)).toEqual(expect.arrayContaining(["../escape.ts", "src/missing.ts"]));
    const changed = inspection.manifest.find((entry) => entry.path === "src/claims/submit.mjs");
    expect(changed?.changed).toBe(true);
    expect(changed?.included).toBe(true);
    expect(inspection.context).toContain("Changed file not inspected: src/missing.ts");
  });

  it("follows imports of changed files to the modules they depend on", () => {
    const inspection = inspectImplementation({
      workspacePath: sampleProject(),
      changedFiles: ["src/components/claim-form.tsx", "src/claims/submit.mjs"],
    });
    const helper = inspection.manifest.find((entry) => entry.path === "src/claims/helper.mjs");
    expect(helper?.importedBy).toBe("src/claims/submit.mjs");
    const format = inspection.manifest.find((entry) => entry.path === "src/lib/format.ts");
    expect(format?.importedBy).toBe("src/components/claim-form.tsx");
    expect(format?.included).toBe(true);
  });

  it("orders changed files before routes and other source", () => {
    const inspection = inspectImplementation({ workspacePath: sampleProject(), changedFiles: ["src/components/claim-form.tsx"] });
    const order = inspection.manifest.map((entry) => entry.path);
    expect(order.indexOf("src/components/claim-form.tsx")).toBeLessThan(order.indexOf("src/app/discovery/page.tsx"));
  });
});

describe("inspectImplementation: safety and bounds", () => {
  it("does not follow a symbolic link that leaves the workspace", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "apf-inspect-outside-"));
    temporary.push(outside);
    fs.writeFileSync(path.join(outside, "leak.ts"), "export const leaked = \"outside-content\";\n");
    const root = sampleProject();
    fs.symlinkSync(path.join(outside, "leak.ts"), path.join(root, "src/linked.ts"));
    const inspection = inspectImplementation({ workspacePath: root });
    expect(inspection.symlinksSkipped).toBeGreaterThanOrEqual(1);
    expect(inspection.manifest.some((entry) => entry.path === "src/linked.ts")).toBe(false);
    expect(inspection.context).not.toContain("outside-content");
  });

  it("never reads secret files and records why", () => {
    const inspection = inspectImplementation({ workspacePath: sampleProject() });
    const secret = inspection.manifest.find((entry) => entry.path === "src/secrets/key.ts");
    expect(secret?.included).toBe(false);
    expect(secret?.reason).toBe("Secret files are not read.");
    expect(inspection.context).not.toContain("sk-live-should-not-be-read");
  });

  it("truncates a large file and says so", () => {
    const large = `export const big = "${"x".repeat(INSPECTION_LIMITS.maxFileCharacters + 500)}";\n`;
    const inspection = inspectImplementation({ workspacePath: sampleProject({ "src/big.ts": large }) });
    const entry = inspection.manifest.find((item) => item.path === "src/big.ts");
    expect(entry?.truncated).toBe(true);
    expect(entry?.characters).toBe(INSPECTION_LIMITS.maxFileCharacters);
    expect(inspection.context).toContain(`[truncated at ${INSPECTION_LIMITS.maxFileCharacters} characters]`);
  });

  it("stops reading when the context budget is spent and records every omission", () => {
    const bulk: Record<string, string> = {};
    for (let index = 0; index < 9; index += 1) {
      bulk[`src/bulk/file${index}.ts`] = `export const value${index} = "${"y".repeat(INSPECTION_LIMITS.maxFileCharacters - 100)}";\n`;
    }
    const inspection = inspectImplementation({ workspacePath: sampleProject(bulk) });
    expect(inspection.omittedFiles).toBeGreaterThan(0);
    expect(inspection.manifest.some((entry) => entry.reason === "The context budget was reached.")).toBe(true);
    expect(inspection.context.length).toBeLessThan(INSPECTION_LIMITS.maxContextCharacters + 20_000);
  });

  it("is deterministic for the same workspace", () => {
    const root = sampleProject();
    const first = inspectImplementation({ workspacePath: root, changedFiles: ["src/claims/submit.mjs"] });
    const second = inspectImplementation({ workspacePath: root, changedFiles: ["src/claims/submit.mjs"] });
    expect(second.context).toBe(first.context);
    expect(second.manifest).toEqual(first.manifest);
  });

  it("writes a manifest that explains each included and omitted file", () => {
    const inspection = inspectImplementation({ workspacePath: sampleProject(), changedFiles: ["src/claims/submit.mjs"] });
    expect(inspection.context).toContain("Manifest (");
    expect(inspection.context).toContain("src/claims/submit.mjs [SOURCE, changed] included");
    expect(inspection.context).toContain("src/secrets/key.ts [SOURCE] omitted: Secret files are not read.");
  });
});

describe("executionCapabilities", () => {
  it("makes the node-test-mjs adapter available only with plain JavaScript product modules", () => {
    const javascript = inspectImplementation({ workspacePath: sampleProject() });
    const adapter = javascript.capabilities.find((item) => item.adapterId === "node-test-mjs");
    expect(adapter?.available).toBe(true);

    const typescriptOnly = inspectImplementation({
      workspacePath: project({
        "package.json": PACKAGE,
        "tsconfig.json": TSCONFIG,
        "src/claims/submit.ts": "export function submitClaim() { return 1; }\n",
      }),
    });
    const unavailable = typescriptOnly.capabilities.find((item) => item.adapterId === "node-test-mjs");
    expect(unavailable?.available).toBe(false);
    expect(unavailable?.reason).toMatch(/cannot load TypeScript or JSX/);
    expect(typescriptOnly.summary).toMatch(/not available/);
  });

  it("reports TypeScript and detected project runners as unsupported requirements, not as capabilities", () => {
    const inspection = inspectImplementation({ workspacePath: sampleProject() });
    expect(inspection.capabilities.map((item) => item.adapterId)).toEqual(["http-blackbox", "node-test-mjs"]);
    expect(inspection.unsupported.some((item) => item.requirement === "TypeScript or JSX product modules")).toBe(true);
    expect(inspection.context).toContain("Unsupported verification requirements");
  });

  it("derives one capability per registered adapter from the profile alone", () => {
    const { profile } = inspectImplementation({ workspacePath: sampleProject() });
    expect(executionCapabilities(profile).map((item) => item.adapterId)).toEqual(["http-blackbox", "node-test-mjs"]);
  });
});

describe("not-executable context follows the registered adapters", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not say HTTP requests or database-backed tests are unavailable while http-blackbox can run them", () => {
    vi.stubEnv("VERIFICATION_DATABASE_ADMIN_URL", "postgresql://verifier@127.0.0.1:5433/postgres");
    const inspection = inspectImplementation({ workspacePath: sampleProject() });
    expect(inspection.capabilities.find((item) => item.adapterId === "http-blackbox")?.available).toBe(true);
    const line = inspection.context.split("\n").find((item) => item.startsWith("Not executable for this implementation"));
    expect(line).toBeDefined();
    expect(line).not.toContain("HTTP requests to a running server");
    expect(line).not.toContain("database-backed tests");
    expect(line).toContain("Vitest");
    expect(line).toContain("browser or UI interaction");
  });

  it("still lists HTTP and database tests as not executable when no verification database is configured", () => {
    vi.stubEnv("VERIFICATION_DATABASE_ADMIN_URL", "");
    const inspection = inspectImplementation({ workspacePath: sampleProject() });
    expect(inspection.capabilities.find((item) => item.adapterId === "http-blackbox")?.available).toBe(false);
    const line = inspection.context.split("\n").find((item) => item.startsWith("Not executable for this implementation"));
    expect(line).toContain("HTTP requests to a running server");
    expect(line).toContain("database-backed tests");
  });

  it("omits an item only when an available adapter provides the capability that makes it executable", () => {
    const withHttp = [
      { adapterId: "http-blackbox", available: true, provides: ["http-request", "verification-database"] },
    ] as unknown as Parameters<typeof notExecutableItems>[0];
    expect(notExecutableItems(withHttp)).not.toContain("HTTP requests to a running server");
    expect(notExecutableItems(withHttp)).toContain("Vitest");

    const unavailable = [
      { adapterId: "http-blackbox", available: false, provides: ["http-request", "verification-database"] },
    ] as unknown as Parameters<typeof notExecutableItems>[0];
    expect(notExecutableItems(unavailable)).toContain("HTTP requests to a running server");
    expect(notExecutableItems(unavailable)).toContain("database-backed tests");
  });
});

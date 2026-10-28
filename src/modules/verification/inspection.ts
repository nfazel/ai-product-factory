import fs from "node:fs";
import path from "node:path";

import { isSecretPath, resolveInside } from "@/modules/coding/policy";
import {
  verificationAdapters,
  type CapabilityReport,
  type UnsupportedRequirement,
} from "@/modules/verification/adapters/registry";
import { importSpecifiers, resolveProductImport } from "@/modules/verification/test-binding";

/**
 * Deterministic inspection of the approved verification workspace.
 *
 * It reads the files the Testing & Verification Agent needs to understand the implementation: the changed files,
 * the project configuration, the route handlers, the UI components, the modules the changed files import, and
 * the existing tests. Every file read comes from the workspace root. Symbolic links are not followed, secret files
 * are never read, and the scan has no fixed directory-depth limit. Work is bounded by a file count and by context
 * characters, and the manifest records every decision so that a reviewer can see what the agent saw.
 *
 * Inspection describes the implementation. It does not execute anything, and its output is not verification evidence.
 */

export const INSPECTION_LIMITS = {
  maxScannedFiles: 5_000,
  maxContextCharacters: 48_000,
  maxFileCharacters: 8_000,
  maxModules: 60,
  maxManifestLines: 120,
  importDepth: 2,
} as const;

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
const CODE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const CONFIG_FILE =
  /^(?:package\.json|jsconfig\.json|tsconfig(?:\.[\w-]+)?\.json|(?:next|vitest|jest|playwright|postcss|tailwind|vite|babel|prettier)\.config\.[cm]?[jt]s|\.mocharc\.[\w.]+|\.babelrc|prisma\/schema\.prisma|pytest\.ini|pyproject\.toml|go\.mod|Cargo\.toml|composer\.json|pom\.xml|build\.gradle(?:\.kts)?)$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)__tests__\//;
const APP_ROUTE_FILE = /(?:^|\/)app\/(?:.*\/)?route\.[cm]?[jt]sx?$/;
const PAGES_API_FILE = /(?:^|\/)pages\/api\/.+\.[cm]?[jt]sx?$/;
const EXCLUDED_DIRECTORIES_ANYWHERE = new Set(["node_modules", ".git", ".next", ".turbo", ".cache", "coverage"]);
const EXCLUDED_DIRECTORIES_AT_ROOT = new Set(["dist", "build", "out", "verification"]);

const FRAMEWORK_DEPENDENCIES: Record<string, string> = {
  next: "Next.js",
  react: "React",
  express: "Express",
  fastify: "Fastify",
  hono: "Hono",
  "@nestjs/core": "NestJS",
  vite: "Vite",
  "@prisma/client": "Prisma",
  prisma: "Prisma",
  vue: "Vue",
  svelte: "Svelte",
};

const TEST_DEPENDENCIES: Record<string, string> = {
  vitest: "Vitest",
  jest: "Jest",
  mocha: "Mocha",
  "@playwright/test": "Playwright",
  cypress: "Cypress",
  ava: "AVA",
};

/**
 * Things no registered adapter can execute. Listed so the agent does not assume they are available. An entry with a
 * capability is omitted while an AVAILABLE adapter provides that capability, so the context never says something is
 * not executable when an adapter can run it.
 */
const NOT_EXECUTABLE: { item: string; capability?: string }[] = [
  { item: "Vitest" },
  { item: "Jest" },
  { item: "Playwright" },
  { item: "Cypress" },
  { item: "HTTP requests to a running server", capability: "http-request" },
  { item: "database-backed tests", capability: "verification-database" },
  { item: "browser or UI interaction" },
];

/** The not-executable items for this implementation, given every adapter's capability report. */
export function notExecutableItems(capabilities: CapabilityReport[]): string[] {
  const available = new Set(capabilities.filter((item) => item.available).flatMap((item) => item.provides));
  return NOT_EXECUTABLE.filter((entry) => !entry.capability || !available.has(entry.capability)).map((entry) => entry.item);
}

export type InspectionKind = "CONFIGURATION" | "ROUTE" | "COMPONENT" | "EXISTING_TEST" | "SOURCE";

export type ManifestEntry = {
  path: string;
  kind: InspectionKind;
  changed: boolean;
  importedBy: string;
  included: boolean;
  characters: number;
  truncated: boolean;
  reason: string;
};

export type ImplementationProfile = {
  packageManager: "npm" | "pnpm" | "yarn" | "bun" | "unknown";
  typescript: boolean;
  frameworks: string[];
  testRunners: string[];
  scripts: string[];
  dependencies: string[];
  routes: { file: string; url: string }[];
  components: string[];
  existingTests: string[];
  plainJavaScriptSources: number;
  typeScriptSources: number;
};

export type ImplementationInspection = {
  profile: ImplementationProfile;
  /** One entry per registered test adapter, evaluated for this implementation. */
  capabilities: CapabilityReport[];
  /** Verification requirements that no registered adapter can execute. */
  unsupported: UnsupportedRequirement[];
  manifest: ManifestEntry[];
  changedFiles: { accepted: string[]; missing: { path: string; reason: string }[] };
  scannedFiles: number;
  scanTruncated: boolean;
  symlinksSkipped: number;
  includedFiles: number;
  omittedFiles: number;
  context: string;
  summary: string;
};

type ScanResult = { files: string[]; scanned: number; symlinks: number; truncated: boolean };

function scanProject(root: string): ScanResult {
  const files: string[] = [];
  let scanned = 0;
  let symlinks = 0;
  let truncated = false;
  const queue = [""];
  while (queue.length > 0 && !truncated) {
    const directory = queue.shift() ?? "";
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(root, directory), { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        symlinks += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES_ANYWHERE.has(entry.name)) continue;
        if (directory === "" && EXCLUDED_DIRECTORIES_AT_ROOT.has(entry.name)) continue;
        queue.push(relative);
        continue;
      }
      if (!entry.isFile()) continue;
      scanned += 1;
      if (scanned > INSPECTION_LIMITS.maxScannedFiles) {
        truncated = true;
        break;
      }
      if (CONFIG_FILE.test(relative) || CODE_FILE.test(relative)) files.push(relative);
    }
  }
  return { files: files.sort(), scanned: Math.min(scanned, INSPECTION_LIMITS.maxScannedFiles), symlinks, truncated };
}

function kindFor(relative: string): InspectionKind {
  if (CONFIG_FILE.test(relative)) return "CONFIGURATION";
  if (TEST_FILE.test(relative)) return "EXISTING_TEST";
  if (APP_ROUTE_FILE.test(relative) || PAGES_API_FILE.test(relative)) return "ROUTE";
  if (/\.[jt]sx$/.test(relative)) return "COMPONENT";
  return "SOURCE";
}

function priority(entry: ManifestEntry) {
  if (entry.kind === "CONFIGURATION") return 0;
  if (entry.changed) return 1;
  if (entry.importedBy) return 2;
  if (entry.kind === "ROUTE") return 3;
  if (entry.kind === "COMPONENT") return 4;
  if (entry.kind === "SOURCE") return 5;
  return 6;
}

/** Reads one project file. Refuses paths that leave the workspace, symbolic links, and secret files. */
export function readProjectFile(root: string, relative: string): { ok: true; text: string } | { ok: false; reason: string } {
  if (isSecretPath(relative)) return { ok: false, reason: "Secret files are not read." };
  const located = resolveInside(root, relative);
  if (!located.ok) return { ok: false, reason: located.reason };
  try {
    if (!fs.statSync(located.absolute).isFile()) return { ok: false, reason: "The path is not a file." };
    return { ok: true, text: fs.readFileSync(located.absolute, "utf8") };
  } catch {
    return { ok: false, reason: "The file could not be read." };
  }
}

function readJson(root: string, relative: string): Record<string, unknown> | null {
  const read = readProjectFile(root, relative);
  if (!read.ok) return null;
  try {
    const parsed: unknown = JSON.parse(read.text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normaliseChangedPath(value: string) {
  const normalised = value.replaceAll("\\", "/").trim().replace(/^\.\//, "");
  if (!normalised || normalised.startsWith("/") || normalised.split("/").includes("..")) return null;
  return normalised;
}

function aliasesFor(root: string) {
  const tsconfig = readJson(root, "tsconfig.json");
  const compilerOptions = tsconfig?.compilerOptions as { paths?: Record<string, string[]> } | undefined;
  const aliases: { prefix: string; target: string }[] = [];
  for (const [pattern, targets] of Object.entries(compilerOptions?.paths ?? {})) {
    const target = targets[0];
    if (!pattern.endsWith("/*") || typeof target !== "string" || !target.endsWith("/*")) continue;
    aliases.push({
      prefix: pattern.slice(0, -1),
      target: target.slice(0, -1).replace(/^\.\//, ""),
    });
  }
  return aliases.length > 0 ? aliases : [{ prefix: "@/", target: "src/" }];
}

function resolveImport(
  fromFile: string,
  specifier: string,
  known: Set<string>,
  aliases: { prefix: string; target: string }[],
) {
  let base: string | null = null;
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    base = resolveProductImport(fromFile, specifier);
  } else {
    const alias = aliases.find((item) => specifier.startsWith(item.prefix));
    if (alias) base = path.posix.normalize(alias.target + specifier.slice(alias.prefix.length));
  }
  if (!base || base.startsWith("..")) return null;
  const stem = base.replace(/\.[cm]?jsx?$/, "");
  const candidates = [
    base,
    ...CODE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...CODE_EXTENSIONS.map((extension) => `${base}/index${extension}`),
    ...CODE_EXTENSIONS.map((extension) => `${stem}${extension}`),
  ];
  return candidates.find((candidate) => known.has(candidate)) ?? null;
}

function routeUrl(relative: string) {
  const segments = (value: string) =>
    value
      .split("/")
      .filter((segment) => segment.length > 0 && !(segment.startsWith("(") && segment.endsWith(")")))
      .join("/");
  const app = /(?:^|\/)app\/((?:.*\/)?)route\.[^/]+$/.exec(relative);
  if (app) return `/${segments(app[1] ?? "")}`.replace(/\/$/, "") || "/";
  const pages = /(?:^|\/)pages\/(api\/.+?)(?:\/index)?\.[^/.]+$/.exec(relative);
  if (pages) return `/${pages[1]}`;
  return relative;
}

function buildProfile(root: string, entries: ManifestEntry[]): ImplementationProfile {
  const pkg = readJson(root, "package.json");
  const scripts = Object.keys((pkg?.scripts as Record<string, unknown> | undefined) ?? {}).sort();
  const dependencyMap = {
    ...((pkg?.dependencies as Record<string, unknown> | undefined) ?? {}),
    ...((pkg?.devDependencies as Record<string, unknown> | undefined) ?? {}),
  };
  const dependencies = Object.keys(dependencyMap).sort();
  const frameworks = [...new Set(dependencies.map((name) => FRAMEWORK_DEPENDENCIES[name]).filter((item): item is string => Boolean(item)))].sort();
  const testRunners = new Set<string>(dependencies.map((name) => TEST_DEPENDENCIES[name]).filter((item): item is string => Boolean(item)));
  const configNames = entries.filter((entry) => entry.kind === "CONFIGURATION").map((entry) => entry.path);
  for (const name of configNames) {
    if (/^vitest\.config\./.test(name)) testRunners.add("Vitest");
    if (/^jest\.config\./.test(name)) testRunners.add("Jest");
    if (/^playwright\.config\./.test(name)) testRunners.add("Playwright");
    if (/^\.mocharc/.test(name)) testRunners.add("Mocha");
    if (name === "pytest.ini") testRunners.add("pytest");
    if (name === "go.mod") testRunners.add("go test");
    if (name === "Cargo.toml") testRunners.add("cargo test");
    if (name === "pom.xml") testRunners.add("Maven");
    if (/^build\.gradle/.test(name)) testRunners.add("Gradle");
  }
  const packageManager = fs.existsSync(path.join(root, "package-lock.json"))
    ? "npm"
    : fs.existsSync(path.join(root, "pnpm-lock.yaml"))
      ? "pnpm"
      : fs.existsSync(path.join(root, "yarn.lock"))
        ? "yarn"
        : fs.existsSync(path.join(root, "bun.lock")) || fs.existsSync(path.join(root, "bun.lockb"))
          ? "bun"
          : pkg
            ? "npm"
            : "unknown";
  const codeEntries = entries.filter((entry) => entry.kind !== "CONFIGURATION");
  return {
    packageManager,
    typescript: fs.existsSync(path.join(root, "tsconfig.json")) || codeEntries.some((entry) => /\.[mc]?tsx?$/.test(entry.path)),
    frameworks,
    testRunners: [...testRunners].sort(),
    scripts,
    dependencies,
    routes: entries
      .filter((entry) => entry.kind === "ROUTE")
      .map((entry) => ({ file: entry.path, url: routeUrl(entry.path) })),
    components: entries.filter((entry) => entry.kind === "COMPONENT").map((entry) => entry.path),
    existingTests: entries.filter((entry) => entry.kind === "EXISTING_TEST").map((entry) => entry.path),
    plainJavaScriptSources: codeEntries.filter((entry) => /\.(?:mjs|cjs|js)$/.test(entry.path) && entry.kind !== "EXISTING_TEST").length,
    typeScriptSources: codeEntries.filter((entry) => /\.[mc]?tsx?$/.test(entry.path)).length,
  };
}

/** Capability of every registered adapter for this profile. Adapters, not this file, decide what can run. */
export function executionCapabilities(profile: ImplementationProfile): CapabilityReport[] {
  return verificationAdapters.capabilities(profile);
}

function renderContext(inspection: Omit<ImplementationInspection, "context" | "summary">, files: { path: string; kind: InspectionKind; text: string; truncated: boolean }[]) {
  const { profile, capabilities, unsupported, manifest } = inspection;
  const lines: string[] = [
    "Implementation inspection of the approved snapshot. Files were read from the verification workspace. Nothing here was executed, and inspection is not verification evidence.",
    `Project: package manager ${profile.packageManager}; TypeScript ${profile.typescript ? "yes" : "no"}; frameworks ${profile.frameworks.join(", ") || "none detected"}; detected test runners ${profile.testRunners.join(", ") || "none detected"}.`,
    `Scripts: ${profile.scripts.join(", ") || "none"}.`,
    `Dependencies (${profile.dependencies.length}): ${profile.dependencies.slice(0, 40).join(", ") || "none"}.`,
    `Routes (${profile.routes.length}):`,
    ...profile.routes.slice(0, 60).map((route) => `- ${route.url} (${route.file})`),
    `Components (${profile.components.length}): ${profile.components.slice(0, 60).join(", ") || "none"}.`,
    `Existing tests (${profile.existingTests.length}): ${profile.existingTests.slice(0, 20).join(", ") || "none"}.`,
    `Changed files: ${inspection.changedFiles.accepted.join(", ") || "none"}.`,
    ...inspection.changedFiles.missing.map((item) => `Changed file not inspected: ${item.path} (${item.reason}).`),
    "Registered test adapters. Only an adapter marked AVAILABLE can execute a test for this implementation:",
    ...capabilities.map(
      (item) =>
        `- ${item.adapterId} (${item.label}): ${item.available ? "AVAILABLE" : "NOT AVAILABLE"}. ${item.reason} Surfaces: ${item.surfaces.join(", ")}. Test files: ${item.fileConvention}. Provides: ${item.provides.join(", ")}.`,
    ),
    "Unsupported verification requirements (no registered adapter can execute these):",
    ...(unsupported.length > 0 ? unsupported.map((item) => `- ${item.requirement}: ${item.reason}`) : ["- none"]),
    `Not executable for this implementation: ${notExecutableItems(capabilities).join(", ")}.`,
    `Manifest (${inspection.scannedFiles} files scanned${inspection.scanTruncated ? "; scan limit reached" : ""}; ${inspection.symlinksSkipped} symbolic links not followed):`,
    ...manifest.slice(0, INSPECTION_LIMITS.maxManifestLines).map(
      (entry) =>
        `- ${entry.path} [${entry.kind}${entry.changed ? ", changed" : ""}${entry.importedBy ? `, imported by ${entry.importedBy}` : ""}] ${entry.included ? "included" : `omitted: ${entry.reason}`}`,
    ),
  ];
  if (manifest.length > INSPECTION_LIMITS.maxManifestLines) {
    lines.push(`... ${manifest.length - INSPECTION_LIMITS.maxManifestLines} more manifest entries not listed.`);
  }
  for (const file of files) {
    lines.push("", `--- ${file.path} (${file.kind}) ---`, file.text + (file.truncated ? `\n[truncated at ${INSPECTION_LIMITS.maxFileCharacters} characters]` : ""));
  }
  return lines.join("\n");
}

export function inspectImplementation(input: { workspacePath: string; changedFiles?: string[] }): ImplementationInspection {
  const root = fs.realpathSync(input.workspacePath);
  const scan = scanProject(root);
  const known = new Set(scan.files);
  const manifest = new Map<string, ManifestEntry>();
  for (const file of scan.files) {
    manifest.set(file, {
      path: file,
      kind: kindFor(file),
      changed: false,
      importedBy: "",
      included: false,
      characters: 0,
      truncated: false,
      reason: "Not yet read.",
    });
  }

  const changedAccepted: string[] = [];
  const changedMissing: { path: string; reason: string }[] = [];
  for (const raw of input.changedFiles ?? []) {
    const normalised = normaliseChangedPath(raw);
    if (!normalised) {
      changedMissing.push({ path: raw, reason: "outside the approved workspace" });
      continue;
    }
    if (!known.has(normalised)) {
      changedMissing.push({ path: normalised, reason: "not found in the workspace, or not a code or configuration file" });
      continue;
    }
    if (!changedAccepted.includes(normalised)) changedAccepted.push(normalised);
    const entry = manifest.get(normalised);
    if (entry) entry.changed = true;
  }

  const aliases = aliasesFor(root);
  let importedCount = 0;
  let frontier = changedAccepted.filter((file) => CODE_FILE.test(file));
  for (let depth = 0; depth < INSPECTION_LIMITS.importDepth && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const file of frontier) {
      const read = readProjectFile(root, file);
      if (!read.ok) continue;
      for (const specifier of importSpecifiers(read.text)) {
        if (importedCount >= INSPECTION_LIMITS.maxModules) break;
        const target = resolveImport(file, specifier, known, aliases);
        if (!target || target === file) continue;
        const entry = manifest.get(target);
        if (!entry || entry.changed || entry.importedBy) continue;
        entry.importedBy = file;
        importedCount += 1;
        next.push(target);
      }
    }
    frontier = next;
  }

  // Changed files first, then the configuration they depend on, then imported modules, routes, components,
  // remaining source, and existing tests. Ties are broken by path, so the order is deterministic.
  const entries = [...manifest.values()].sort(
    (left, right) => priority(left) - priority(right) || left.path.localeCompare(right.path),
  );
  const profile = buildProfile(root, [...manifest.values()]);
  const capabilities = executionCapabilities(profile);
  const unsupported = verificationAdapters.unsupported(profile);

  const files: { path: string; kind: InspectionKind; text: string; truncated: boolean }[] = [];
  let used = 0;
  for (const entry of entries) {
    const read = readProjectFile(root, entry.path);
    if (!read.ok) {
      entry.reason = read.reason;
      continue;
    }
    const text = read.text.slice(0, INSPECTION_LIMITS.maxFileCharacters);
    if (used + text.length > INSPECTION_LIMITS.maxContextCharacters) {
      entry.reason = "The context budget was reached.";
      continue;
    }
    used += text.length;
    entry.included = true;
    entry.characters = text.length;
    entry.truncated = read.text.length > INSPECTION_LIMITS.maxFileCharacters;
    entry.reason = "";
    files.push({ path: entry.path, kind: entry.kind, text, truncated: entry.truncated });
  }

  const includedFiles = entries.filter((entry) => entry.included).length;
  const partial = {
    profile,
    capabilities,
    unsupported,
    manifest: entries,
    changedFiles: { accepted: changedAccepted, missing: changedMissing },
    scannedFiles: scan.scanned,
    scanTruncated: scan.truncated,
    symlinksSkipped: scan.symlinks,
    includedFiles,
    omittedFiles: entries.length - includedFiles,
  };
  const context = renderContext(partial, files);
  const available = capabilities.filter((item) => item.available).map((item) => item.label);
  const summary = [
    `Inspected ${includedFiles} of ${scan.files.length} project files (${changedAccepted.length} changed file${changedAccepted.length === 1 ? "" : "s"} inspected${changedMissing.length ? `, ${changedMissing.length} not inspected` : ""}).`,
    available.length > 0
      ? `Automated execution available: ${available.join("; ")}.`
      : "Automated execution is not available for this implementation in this phase.",
  ].join(" ");
  return { ...partial, context, summary };
}

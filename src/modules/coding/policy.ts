import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const BASE_COMMANDS = [
  "npm test",
  "npm run test",
  "npm run lint",
  "npm run typecheck",
  "npm run build",
] as const;

export const METADATA_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "README.md",
  ".env.example",
]);

/** Always denied, even when a coding policy lists them as allowed. */
export const ALWAYS_RESTRICTED = [
  ".git/**",
  ".github/**",
  ".github/workflows/**",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yml",
];

const PATCH_LIMIT = 100_000;

export type PathDecision =
  | { ok: true; absolute: string; relative: string }
  | { ok: false; reason: string };

export function toPosix(value: string) {
  return value.replaceAll("\\", "/");
}

export function matchGlob(pattern: string, relativePath: string) {
  const raw = toPosix(pattern).replace(/^\.\//, "");
  const target = toPosix(relativePath).replace(/^\.\//, "");
  if (raw.endsWith("/")) {
    const prefix = raw.replace(/\/+$/, "");
    return Boolean(prefix) && (target === prefix || target.startsWith(`${prefix}/`));
  }
  const normalized = raw.replace(/\/+$/, "");
  if (!normalized || normalized === "**") return target.length > 0;
  const expression = globToRegExp(normalized);
  if (expression.test(target)) return true;
  if (normalized.endsWith("/**")) {
    const prefix = normalized.slice(0, -3);
    return target === prefix || target.startsWith(`${prefix}/`);
  }
  return false;
}

function globToRegExp(pattern: string) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern.startsWith("**", index)) {
      source += ".*";
      index += 1;
      if (pattern[index + 1] === "/") index += 1;
      continue;
    }
    const char = pattern[index] ?? "";
    if (char === "*") source += "[^/]*";
    else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

export function isSecretPath(relativePath: string) {
  const posix = toPosix(relativePath);
  const base = path.posix.basename(posix);
  if (base === ".env.example" || base === ".env.sample" || base === ".env.template") return false;
  if (base === ".env" || base.startsWith(".env.")) return true;
  if (base === "id_rsa" || base === "id_ed25519" || base === "credentials.json" || base === ".npmrc") {
    return true;
  }
  if (base.endsWith(".pem") || base.endsWith(".key")) return true;
  const parts = posix.split("/");
  return parts.some((part) => part === ".ssh" || part === ".aws" || part === ".gnupg" || part === "secrets");
}

export function isMetadataRead(relativePath: string) {
  return METADATA_FILES.has(path.posix.basename(toPosix(relativePath)));
}

export function isTestFile(relativePath: string) {
  const base = path.posix.basename(toPosix(relativePath));
  return (
    base.includes(".test.") ||
    base.includes(".spec.") ||
    base.endsWith(".test") ||
    base.endsWith("_test.ts") ||
    base.endsWith("_test.js")
  );
}

export function isSecurityConfig(relativePath: string) {
  return ALWAYS_RESTRICTED.some((pattern) => matchGlob(pattern, relativePath));
}

export function pathMatches(relativePath: string, patterns: string[]) {
  return patterns.some((pattern) => matchGlob(pattern, relativePath));
}

/**
 * Verification-only files belong to the Testing & Verification Agent. The Coding Agent may not write or read
 * them, so the verification that judges an implementation cannot be shaped by the implementation's author.
 * This is deliberately not in ALWAYS_RESTRICTED, which the verification policy also consults.
 */
export function isVerificationReservedPath(relativePath: string) {
  const posix = toPosix(relativePath).replace(/^\.\//, "");
  return posix === "verification" || posix.startsWith("verification/");
}

export function classifyWrite(relativePath: string, allowed: string[], restricted: string[]) {
  if (isSecretPath(relativePath)) {
    return { ok: false as const, kind: "secret" as const, reason: "Secret files cannot be read or modified." };
  }
  if (isVerificationReservedPath(relativePath)) {
    return {
      ok: false as const,
      kind: "restricted" as const,
      reason: "Verification files are reserved for the Testing & Verification Agent.",
    };
  }
  if (isSecurityConfig(relativePath) || pathMatches(relativePath, restricted) || pathMatches(relativePath, ALWAYS_RESTRICTED)) {
    return {
      ok: false as const,
      kind: "restricted" as const,
      reason: "That path is outside the execution contract.",
    };
  }
  if (allowed.length === 0 || !pathMatches(relativePath, allowed)) {
    return {
      ok: false as const,
      kind: "scope" as const,
      reason: "That path is not in the allowed paths for this task.",
    };
  }
  return { ok: true as const, kind: "allowed" as const, reason: "" };
}

export function filesOutsideContract(files: string[], allowed: string[], restricted: string[]) {
  return files.filter((file) => !classifyWrite(file, allowed, restricted).ok);
}

/**
 * Paths that block execution-plan approval when outside the coding contract.
 * Tooling metadata such as `.gitignore` can be named in a plan revision without widening the contract first.
 */
export function filesBlockingPlanApproval(files: string[], allowed: string[], restricted: string[]) {
  return filesOutsideContract(files, allowed, restricted).filter((file) => {
    const normalized = file.replaceAll("\\", "/");
    return normalized !== ".gitignore"
      && !normalized.endsWith("/.gitignore")
      && normalized !== ".gitattributes"
      && normalized !== ".editorconfig";
  });
}

export function outsideApprovedPlan(file: string, expected: string[]) {
  return expected.length > 0 && !expected.includes(file);
}

export function classifyRead(relativePath: string, allowed: string[], restricted: string[]) {
  if (isSecretPath(relativePath)) {
    return { ok: false as const, kind: "secret" as const, reason: "Secret files cannot be read or modified." };
  }
  if (relativePath === ".git" || relativePath.startsWith(".git/")) {
    return { ok: false as const, kind: "restricted" as const, reason: "Git metadata is not readable by the Coding Agent." };
  }
  if (isMetadataRead(relativePath) && !pathMatches(relativePath, restricted) && !isSecurityConfig(relativePath)) {
    return { ok: true as const, kind: "metadata" as const, reason: "" };
  }
  return classifyWrite(relativePath, allowed, restricted);
}

function isInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveInside(root: string, requested: string, options?: { allowMissingParents?: boolean }): PathDecision {
  if (!requested || requested.includes("\0")) {
    return { ok: false, reason: "The path is not permitted." };
  }
  let rootReal: string;
  try {
    rootReal = fs.realpathSync(root);
  } catch {
    return { ok: false, reason: "The workspace path is not available." };
  }
  const raw = toPosix(requested.trim());
  if (path.isAbsolute(requested) || raw.startsWith("/")) {
    const resolved = path.resolve(requested);
    if (!isInside(rootReal, resolved)) {
      return { ok: false, reason: "The path is outside the workspace." };
    }
    return resolveInside(root, path.relative(rootReal, resolved));
  }
  const segments = raw.split("/").filter((segment) => segment.length > 0 && segment !== ".");
  if (segments.some((segment) => segment === "..")) {
    return { ok: false, reason: "Path traversal is not permitted." };
  }

  let current = rootReal;
  const allowMissingParents = options?.allowMissingParents === true;
  let pending: string[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] ?? "";
    if (segment.includes("\0") || segment === "..") {
      return { ok: false, reason: "Path traversal is not permitted." };
    }
    if (pending.length > 0) {
      pending.push(segment);
      continue;
    }
    const next = path.join(current, segment);
    if (!fs.existsSync(next)) {
      if (!allowMissingParents && index !== segments.length - 1) {
        return { ok: false, reason: "The directory does not exist inside the workspace." };
      }
      if (allowMissingParents && index !== segments.length - 1) {
        pending = segments.slice(index);
        break;
      }
      current = next;
      break;
    }
    const stat = fs.lstatSync(next);
    if (stat.isSymbolicLink()) {
      let target: string;
      try {
        target = fs.realpathSync(next);
      } catch {
        return { ok: false, reason: "Symbolic links cannot leave the workspace." };
      }
      if (!isInside(rootReal, target)) {
        return { ok: false, reason: "Symbolic links cannot leave the workspace." };
      }
      current = target;
      continue;
    }
    if (index < segments.length - 1 && !stat.isDirectory()) {
      return { ok: false, reason: "The path is not a directory." };
    }
    current = fs.realpathSync(next);
    if (!isInside(rootReal, current)) {
      return { ok: false, reason: "Symbolic links cannot leave the workspace." };
    }
  }

  if (pending.length > 0) {
    const absolute = path.resolve(current, ...pending);
    if (!isInside(rootReal, absolute)) {
      return { ok: false, reason: "The path is outside the workspace." };
    }
    const relative = toPosix(path.relative(rootReal, absolute));
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      return { ok: false, reason: "The path is outside the workspace." };
    }
    return { ok: true, absolute, relative };
  }

  const parent = fs.existsSync(current) ? path.dirname(fs.realpathSync(current)) : path.dirname(current);
  let parentReal: string;
  try {
    parentReal = fs.realpathSync(parent);
  } catch {
    return { ok: false, reason: "The path is outside the workspace." };
  }
  if (!isInside(rootReal, parentReal)) {
    return { ok: false, reason: "The path is outside the workspace." };
  }
  const finalPath = fs.existsSync(current) ? fs.realpathSync(current) : current;
  if (fs.existsSync(current) && !isInside(rootReal, finalPath)) {
    return { ok: false, reason: "The path is outside the workspace." };
  }
  const relative = toPosix(path.relative(rootReal, finalPath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return { ok: false, reason: "The path is outside the workspace." };
  }
  return { ok: true, absolute: finalPath, relative };
}

export function ensureParentDirectory(root: string, relativePath: string, allowed: string[], restricted: string[]) {
  const normalised = toPosix(relativePath).replace(/^\.\//, "");
  const decision = classifyWrite(normalised, allowed, restricted);
  if (!decision.ok) return { ok: false as const, reason: decision.reason, kind: decision.kind };
  const located = resolveInside(root, normalised, { allowMissingParents: true });
  if (!located.ok) return { ok: false as const, reason: located.reason, kind: "scope" as const };
  const parent = path.dirname(located.absolute);
  fs.mkdirSync(parent, { recursive: true });
  let parentReal: string;
  let rootReal: string;
  try {
    parentReal = fs.realpathSync(parent);
    rootReal = fs.realpathSync(root);
  } catch {
    return { ok: false as const, reason: "The path is outside the workspace.", kind: "restricted" as const };
  }
  if (!isInside(rootReal, parentReal) || !fs.statSync(parentReal).isDirectory()) {
    return { ok: false as const, reason: "The path is outside the workspace.", kind: "restricted" as const };
  }
  return { ok: true as const, absolute: located.absolute, relative: located.relative };
}

export function approveCommand(raw: string, authorisedCommands: string[]) {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return { ok: false as const, reason: "An empty command is not permitted." };
  if (/[;&|`$<>\\\n\r]/.test(trimmed) || trimmed.includes("$(")) {
    return { ok: false as const, reason: "Shell chaining is not permitted." };
  }
  const lower = trimmed.toLowerCase();
  if (
    /\brm\b/.test(lower) ||
    /\bsudo\b/.test(lower) ||
    /\bcurl\b/.test(lower) ||
    /\bwget\b/.test(lower) ||
    /\bprintenv\b/.test(lower) ||
    /(^|\s)env(\s|$)/.test(lower) ||
    /reset\s+--hard/.test(lower) ||
    /\bgit\s+push\b/.test(lower) ||
    /--force/.test(lower)
  ) {
    return { ok: false as const, reason: "That command is not permitted." };
  }
  const argv = trimmed.split(" ");
  if (argv.some((token) => token.startsWith("-") || !/^[A-Za-z0-9._:@/=+]+$/.test(token))) {
    return { ok: false as const, reason: "That command is not permitted." };
  }
  const authorised = authorisedCommands.map((command) => command.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (!authorised.includes(trimmed)) {
    return { ok: false as const, reason: "That command is not in the approved execution contract." };
  }
  const catalog = new Set<string>([...BASE_COMMANDS, "npm install", "npx prisma generate", "npx prisma validate"]);
  if (!catalog.has(trimmed)) {
    return { ok: false as const, reason: "That command is not permitted." };
  }
  return { ok: true as const, argv, command: trimmed };
}

export function weakensChecks(relativePath: string, before: string, after: string) {
  if (isSecurityConfig(relativePath)) {
    return "Modifying CI or security configuration is not permitted.";
  }
  if (/eslint-disable|@ts-nocheck|@ts-ignore/.test(after) && !/eslint-disable|@ts-nocheck|@ts-ignore/.test(before)) {
    return "Disabling a lint or type check is not permitted.";
  }
  if (!isTestFile(relativePath)) return null;
  if (/\.skip\s*\(|\bxit\s*\(|\bxdescribe\s*\(|\btest\.skip\b|\bit\.skip\b|\bdescribe\.skip\b/.test(after)) {
    return "Skipping a test is not permitted.";
  }
  const beforeExpects = before.match(/\bexpect\s*\(/g)?.length ?? 0;
  const afterExpects = after.match(/\bexpect\s*\(/g)?.length ?? 0;
  if (afterExpects < beforeExpects) return "Removing test expectations is not permitted.";
  return null;
}

export function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export { PATCH_LIMIT };

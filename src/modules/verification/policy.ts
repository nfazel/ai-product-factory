import fs from "node:fs";
import path from "node:path";

import { SAFE_SETUP_COMMANDS, SAFE_VALIDATION_COMMANDS } from "@/modules/coding/commands";
import { approveCommand, isSecretPath, resolveInside, ALWAYS_RESTRICTED, matchGlob } from "@/modules/coding/policy";

const TEST_PATH = /^verification\/[A-Za-z0-9._/-]+\.test\.mjs$/;
const FIXTURE_PATH = /^verification\/[A-Za-z0-9._/-]+\/fixtures\/[A-Za-z0-9._/-]+$/;

export function isVerificationTestPath(relativePath: string) {
  return TEST_PATH.test(relativePath.replaceAll("\\", "/"));
}

export function isVerificationFixturePath(relativePath: string) {
  return FIXTURE_PATH.test(relativePath.replaceAll("\\", "/"));
}

export function verificationMarker(criterionId: string) {
  return `// verifies:${criterionId}`;
}

export function demonstratesCriterion(body: string, criterionId: string) {
  return body.includes(verificationMarker(criterionId)) && /\b(assert|expect)\b/.test(body);
}

export function classifyVerificationWrite(root: string, relativePath: string) {
  const normalized = relativePath.replaceAll("\\", "/").trim();
  if (!normalized || normalized.includes("\0") || normalized.split("/").includes("..")) {
    return { ok: false as const, reason: "The path is not permitted." };
  }
  if (isSecretPath(normalized) || ALWAYS_RESTRICTED.some((pattern) => matchGlob(pattern, normalized))) {
    return { ok: false as const, reason: "That path is restricted." };
  }
  if (!isVerificationTestPath(normalized) && !isVerificationFixturePath(normalized)) {
    return {
      ok: false as const,
      reason: "Verification cannot modify production implementation code.",
    };
  }
  const located = resolveInside(root, normalized);
  if (located.ok) return located;
  if (!located.reason.includes("does not exist")) return located;
  try {
    const rootReal = fs.realpathSync(root);
    const parent = path.posix.dirname(normalized);
    const parentAbsolute = path.resolve(rootReal, parent);
    const rootPrefix = rootReal.endsWith(path.sep) ? rootReal : `${rootReal}${path.sep}`;
    if (parentAbsolute !== rootReal && !parentAbsolute.startsWith(rootPrefix)) {
      return { ok: false as const, reason: "The path is outside the workspace." };
    }
    fs.mkdirSync(parentAbsolute, { recursive: true });
  } catch {
    return { ok: false as const, reason: "The verification directory could not be created." };
  }
  return resolveInside(root, normalized);
}

export function classifyVerificationRead(root: string, relativePath: string) {
  const located = resolveInside(root, relativePath);
  if (!located.ok) return located;
  if (isSecretPath(located.relative)) {
    return { ok: false as const, reason: "Secret files are not readable." };
  }
  return located;
}

const REPOSITORY_TEST_COMMANDS = [
  "go test ./...",
  "cargo test",
  "pytest",
  "composer test",
  "mvn test",
  "gradle test",
] as const;

export function approveVerificationCommand(raw: string) {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (/[;&|`$<>\\\n\r]/.test(trimmed) || trimmed.includes("$(")) {
    return { ok: false as const, reason: "Shell chaining is not permitted." };
  }
  const parts = trimmed.split(" ");
  if (parts.length === 3 && parts[0] === "node" && parts[1] === "--test" && isVerificationTestPath(parts[2] ?? "")) {
    return { ok: true as const, argv: parts, command: trimmed };
  }
  const lower = trimmed.toLowerCase();
  if (/\brm\b/.test(lower) || /\bsudo\b/.test(lower) || /\bcurl\b/.test(lower) || /\bwget\b/.test(lower) || /\bgit\s+push\b/.test(lower) || /--force/.test(lower)) {
    return { ok: false as const, reason: "That command is not permitted." };
  }
  if (parts.some((token) => token.startsWith("-") || !/^[A-Za-z0-9._:@/=+]+$/.test(token))) {
    return { ok: false as const, reason: "That command is not permitted." };
  }
  const allowed = new Set<string>([...SAFE_SETUP_COMMANDS, ...SAFE_VALIDATION_COMMANDS, ...REPOSITORY_TEST_COMMANDS]);
  if (allowed.has(trimmed) || /^npm run test(?::[A-Za-z0-9._-]+)?$/.test(trimmed)) {
    return { ok: true as const, argv: parts, command: trimmed };
  }
  return approveCommand(trimmed, [...SAFE_VALIDATION_COMMANDS]);
}

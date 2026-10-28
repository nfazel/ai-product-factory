import fs from "node:fs";
import path from "node:path";

import { resolveInside } from "@/modules/coding/policy";
import { isVerificationTestPath, verificationMarker } from "@/modules/verification/policy";

/**
 * Decides whether a verification test is bound to an acceptance criterion and to product behaviour.
 *
 * This is a conservative, text-based check. It is not a proof that a test is meaningful. It exists to stop the
 * most common ways a test can look like verification while proving nothing:
 * - no criterion marker, so the test is not linked to the criterion;
 * - no import of a product module, so the test cannot exercise implementation behaviour;
 * - literal or self-comparing assertions such as assert.ok(true) or assert.equal(1, 1);
 * - skipped or todo tests;
 * - imports the run cannot satisfy (TypeScript, JSX, bare packages, aliases, files that do not exist).
 *
 * A test that passes this check can still be weak. The remaining limitation is documented in the Phase 0 report.
 */

const TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".jsx", ".mts", ".cts"]);
const JAVASCRIPT_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);

export type TestStructureAssessment = {
  ok: boolean;
  reasons: string[];
  declaredTests: number;
  productImports: string[];
  meaningfulAssertions: number;
  trivialAssertions: number;
};

export type TestBindingAssessment = {
  ok: boolean;
  reasons: string[];
  structure: TestStructureAssessment;
};

/** Literal values only: strings, numbers, booleans, null, undefined, and empty array or object literals. */
const LITERAL_TOKENS =
  /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\$]|\\.)*`|\b(?:true|false|null|undefined|NaN|Infinity)\b|\b\d[\d_]*(?:\.\d+)?\b/g;

export function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:\\"'`])\/\/[^\n]*/g, "$1");
}

/** True when an argument contains no reference to a value, only literals and operators between them. */
export function isLiteralExpression(argument: string) {
  const remainder = argument.replace(LITERAL_TOKENS, " ");
  return /^[\s()!=<>&|+\-*/%?:,.[\]{}]*$/.test(remainder);
}

function pushArgument(args: string[], raw: string) {
  const trimmed = raw.trim();
  if (trimmed) args.push(trimmed);
}

/** Reads the top-level arguments of a call. `openIndex` is the index of the opening parenthesis. */
export function readArguments(source: string, openIndex: number): { args: string[]; end: number } {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  let quote: string | null = null;
  for (let index = openIndex + 1; index < source.length; index += 1) {
    const char = source[index] ?? "";
    if (quote) {
      current += char;
      if (char === "\\") {
        current += source[index + 1] ?? "";
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
    } else if (char === ")" || char === "]" || char === "}") {
      if (depth === 0 && char === ")") {
        pushArgument(args, current);
        return { args, end: index + 1 };
      }
      depth = Math.max(0, depth - 1);
    } else if (char === "," && depth === 0) {
      pushArgument(args, current);
      current = "";
      continue;
    }
    current += char;
  }
  return { args, end: source.length };
}

/**
 * Finds assertion calls: assert(...), assert.x(...), and expect(...).matcher(...). For expect, the matcher
 * arguments belong to the same assertion.
 */
export function assertionArguments(source: string): string[][] {
  const assertions: string[][] = [];
  for (const match of source.matchAll(/\b(?:assert(?:\.[A-Za-z]+)?|expect)\s*\(/g)) {
    const openIndex = (match.index ?? 0) + match[0].length - 1;
    const first = readArguments(source, openIndex);
    const args = [...first.args];
    if (match[0].startsWith("expect")) {
      let end = first.end;
      for (;;) {
        const chain = /^\s*\.\s*(?:not\s*\.\s*)?[A-Za-z_]\w*\s*\(/.exec(source.slice(end));
        if (!chain) break;
        const parsed = readArguments(source, end + chain[0].length - 1);
        args.push(...parsed.args);
        end = parsed.end;
      }
    }
    assertions.push(args);
  }
  return assertions;
}

function isTrivialAssertion(args: string[]) {
  if (args.length === 0) return true;
  if (args.every(isLiteralExpression)) return true;
  if (args.length >= 2 && new Set(args.map((item) => item.replace(/\s+/g, ""))).size === 1) return true;
  return false;
}

function escapeForRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Import specifiers of a test file, in source order. */
export function importSpecifiers(source: string) {
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const found: { index: number; specifier: string }[] = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) found.push({ index: match.index ?? 0, specifier: match[1] });
    }
  }
  return found.sort((left, right) => left.index - right.index).map((item) => item.specifier);
}

/**
 * Resolves a relative import from a verification test to a path relative to the workspace root. Returns null
 * when the import leaves the workspace.
 */
export function resolveProductImport(testFilePath: string, specifier: string) {
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(testFilePath.replaceAll("\\", "/")), specifier));
  if (joined === ".." || joined.startsWith("../") || path.posix.isAbsolute(joined)) return null;
  return joined;
}

/**
 * A black-box HTTP test body: it reaches the managed application through the base URL the framework provides, with
 * fetch. Such a test must not import product modules; its evidence is the response it observes.
 */
export function isHttpBlackboxTest(body: string) {
  const code = stripComments(body);
  return /\bVERIFICATION_BASE_URL\b/.test(code) && /\bfetch\s*\(/.test(code);
}

/**
 * Declared intent that a case should run as HTTP black-box. Taken from the proposal (adapter, surface, file path), not
 * inferred only from the body. A proposal that names the HTTP adapter but omits fetch must be judged under HTTP rules,
 * not as a module test that "forgot" to import product code.
 */
export type BindingExecutionHint = {
  filePath?: string;
  adapterId?: string;
  targetSurface?: string;
};

export function isHttpExecutionIntent(hint?: BindingExecutionHint) {
  if (!hint) return false;
  if (hint.adapterId === "http-blackbox") return true;
  if (hint.targetSurface === "HTTP_ENDPOINT") return true;
  const filePath = (hint.filePath ?? "").replaceAll("\\", "/");
  return filePath.startsWith("verification/http/");
}

/**
 * True when fetch is called with a literal absolute http(s) URL. Those requests leave the managed application and are
 * refused by the verification guard; they are also refused at planning time so the gap is visible before execution.
 */
export function fetchTargetsExternalOrigin(body: string) {
  const code = stripComments(body);
  return /\bfetch\s*\(\s*(?:new\s+URL\s*\(\s*)?["']https?:\/\//.test(code);
}

/**
 * True when the body carries the criterion marker as a standalone line comment, `// verifies:<id>`. A marker inside a
 * test title, a string, or a sentence does not count. This is the single definition the validator and the planning
 * prompt both rely on.
 */
export function hasStandaloneMarker(body: string, criterionId: string) {
  if (!criterionId) return false;
  const markerPattern = new RegExp(`(?:^|\\n)\\s*${escapeForRegExp(verificationMarker(criterionId))}(?![A-Za-z0-9_-])`);
  return markerPattern.test(body);
}

export function assessTestStructure(
  body: string,
  criterionId: string,
  hint?: BindingExecutionHint,
): TestStructureAssessment {
  const reasons: string[] = [];
  const code = stripComments(body);
  const declaredTests = (code.match(/\b(?:test|it)\s*\(/g) ?? []).length;
  const productImports: string[] = [];
  // Prefer declared HTTP intent over body heuristics, so an incomplete HTTP proposal is judged as HTTP, not as a
  // module test missing imports.
  const httpMode = isHttpExecutionIntent(hint) || isHttpBlackboxTest(body);

  if (!hasStandaloneMarker(body, criterionId)) {
    reasons.push(`The test does not carry the marker ${verificationMarker(criterionId)} for its acceptance criterion.`);
  }
  if (declaredTests === 0) {
    reasons.push("The file declares no node:test test.");
  }
  if (/\b(?:test|it|describe|suite)\.(?:skip|todo)\s*\(|\b(?:skip|todo)\s*:\s*(?:true|["'][^"']*["'])/.test(code)) {
    reasons.push("Skipped or todo tests cannot demonstrate behaviour.");
  }

  for (const specifier of importSpecifiers(code)) {
    if (specifier.startsWith("node:")) continue;
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      productImports.push(specifier);
      continue;
    }
    reasons.push(
      httpMode
        ? `The HTTP test imports ${specifier}. An HTTP black-box test may only use node: built-ins; it must not import packages or product modules.`
        : `The test imports ${specifier}. Only node: built-ins and relative JavaScript product modules can run in this verification environment.`,
    );
  }

  if (httpMode) {
    if (productImports.length > 0) {
      reasons.push("An HTTP black-box test must not import product modules. It may only call the managed application over HTTP.");
    }
    if (!/\bVERIFICATION_BASE_URL\b/.test(code)) {
      reasons.push("An HTTP black-box test must read VERIFICATION_BASE_URL so it reaches only the managed application.");
    }
    if (!/\bfetch\s*\(/.test(code)) {
      reasons.push("An HTTP black-box test must call fetch against the managed application. Without a request it observes no behaviour.");
    }
    if (fetchTargetsExternalOrigin(body)) {
      reasons.push("An HTTP black-box test must not call fetch with a literal external URL. Requests may reach only the managed application.");
    }
  } else {
    const extensionReasons = productImports.flatMap((specifier) => {
      const extension = path.posix.extname(specifier);
      if (TYPESCRIPT_EXTENSIONS.has(extension)) {
        return [`The test imports ${specifier}, which is TypeScript or JSX. node:test cannot load it in this verification environment.`];
      }
      if (!JAVASCRIPT_EXTENSIONS.has(extension)) {
        return [`The test imports ${specifier} without a JavaScript extension (.js, .mjs or .cjs), so node:test cannot resolve it reliably.`];
      }
      return [];
    });
    reasons.push(...extensionReasons);
    if (productImports.length === 0) {
      reasons.push("The test does not import any product module, so it cannot exercise implementation behaviour.");
    }
  }

  const assertions = assertionArguments(code);
  const trivialAssertions = assertions.filter(isTrivialAssertion).length;
  const meaningfulAssertions = assertions.length - trivialAssertions;
  if (trivialAssertions > 0) {
    reasons.push(
      `The test contains ${trivialAssertions} trivial assertion${trivialAssertions === 1 ? "" : "s"} (for example assert.ok(true) or assert.equal(1, 1)). Literal or self-comparing assertions cannot verify a criterion.`,
    );
  }
  if (meaningfulAssertions === 0) {
    reasons.push(
      httpMode
        ? "The test has no assertion on an HTTP response, so it does not check what the product returned."
        : "The test has no assertion on the result of product code.",
    );
  }

  return {
    ok: reasons.length === 0,
    reasons,
    declaredTests,
    productImports,
    meaningfulAssertions,
    trivialAssertions,
  };
}

/**
 * Full binding check for a planned automated case. `workspacePath` is the approved snapshot the test will run
 * against; imported product modules must exist there. HTTP cases are judged by declared intent and by the requests
 * they make, not by product imports.
 */
export function assessTestBinding(input: {
  body: string;
  criterionId: string;
  filePath: string;
  workspacePath: string;
  adapterId?: string;
  targetSurface?: string;
}): TestBindingAssessment {
  const hint: BindingExecutionHint = {
    filePath: input.filePath,
    adapterId: input.adapterId,
    targetSurface: input.targetSurface,
  };
  const structure = assessTestStructure(input.body, input.criterionId, hint);
  const reasons = [...structure.reasons];
  const httpMode = isHttpExecutionIntent(hint) || isHttpBlackboxTest(input.body);
  if (httpMode) {
    // HTTP tests are bound through the requests they make, not through module imports. Their file must sit in
    // verification/http/, which the http-blackbox adapter enforces; the policy gate checks the path itself.
    if (!input.filePath.startsWith("verification/http/") || !isVerificationTestPath(input.filePath)) {
      reasons.push(`The HTTP test file ${input.filePath || "(none)"} must be verification/http/<name>.test.mjs.`);
    }
    return { ok: reasons.length === 0, reasons, structure };
  }
  if (!isVerificationTestPath(input.filePath)) {
    reasons.push(
      `The test file ${input.filePath || "(none)"} was refused by verification policy. Verification tests must be verification/<name>.test.mjs.`,
    );
  }
  if (isVerificationTestPath(input.filePath)) {
    for (const specifier of structure.productImports) {
      const resolved = resolveProductImport(input.filePath, specifier);
      if (!resolved) {
        reasons.push(`The test imports ${specifier}, which is outside the approved snapshot.`);
        continue;
      }
      if (!productModuleExists(input.workspacePath, resolved)) {
        reasons.push(`The test imports ${specifier}, which does not exist in the approved snapshot.`);
      }
    }
  }
  return { ok: reasons.length === 0, reasons, structure };
}

function productModuleExists(workspacePath: string, relative: string) {
  const located = resolveInside(workspacePath, relative);
  if (!located.ok) return false;
  return fs.existsSync(located.absolute) && fs.statSync(located.absolute).isFile();
}

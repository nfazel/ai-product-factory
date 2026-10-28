import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  assertionArguments,
  assessTestBinding,
  assessTestStructure,
  fetchTargetsExternalOrigin,
  isHttpBlackboxTest,
  isHttpExecutionIntent,
  isLiteralExpression,
  readArguments,
  resolveProductImport,
} from "@/modules/verification/test-binding";

const CRITERION = "crit123";
const MARKER = `// verifies:${CRITERION}`;
const FILE = "verification/crit123/claim.test.mjs";

function behaviouralTest(assertion = "assert.equal(submitClaim().reference, \"CLM-1001\");") {
  return [
    "import test from \"node:test\";",
    "import assert from \"node:assert/strict\";",
    "import { submitClaim } from \"../../src/claims/submit.mjs\";",
    MARKER,
    `test("submit", () => { ${assertion} });`,
    "",
  ].join("\n");
}

const temporary: string[] = [];

function workspaceWith(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apf-binding-"));
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

describe("assessTestStructure", () => {
  it("accepts a test that imports product code and asserts on what it returns", () => {
    const result = assessTestStructure(behaviouralTest(), CRITERION);
    expect(result.ok).toBe(true);
    expect(result.productImports).toEqual(["../../src/claims/submit.mjs"]);
    expect(result.meaningfulAssertions).toBeGreaterThan(0);
    expect(result.trivialAssertions).toBe(0);
  });

  it("requires the criterion marker", () => {
    const result = assessTestStructure(behaviouralTest().replace(MARKER, ""), CRITERION);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain(MARKER);
  });

  it("does not accept a marker for a different criterion that shares a prefix", () => {
    const result = assessTestStructure(behaviouralTest().replace(MARKER, "// verifies:crit1234"), CRITERION);
    expect(result.ok).toBe(false);
  });

  it("rejects assert.ok(true) as a trivial assertion", () => {
    const result = assessTestStructure(behaviouralTest("assert.ok(true);"), CRITERION);
    expect(result.ok).toBe(false);
    expect(result.trivialAssertions).toBe(1);
    expect(result.reasons.join(" ")).toMatch(/trivial assertion/);
  });

  it("rejects a self-comparing assertion such as assert.equal(1, 1)", () => {
    expect(assessTestStructure(behaviouralTest("assert.equal(1, 1);"), CRITERION).ok).toBe(false);
  });

  it("rejects a value compared with itself", () => {
    const result = assessTestStructure(behaviouralTest("const value = submitClaim(); assert.equal(value, value);"), CRITERION);
    expect(result.ok).toBe(false);
  });

  it("rejects an expect that compares literals only", () => {
    const body = behaviouralTest("expect(true).toBe(true);").replace("import assert from \"node:assert/strict\";", "");
    expect(assessTestStructure(body, CRITERION).ok).toBe(false);
  });

  it("does not count an assertion that appears only in a comment", () => {
    const body = behaviouralTest("// assert.equal(submitClaim().reference, \"CLM-1001\");");
    const result = assessTestStructure(body, CRITERION);
    expect(result.ok).toBe(false);
    expect(result.meaningfulAssertions).toBe(0);
  });

  it("rejects a skipped or todo test", () => {
    const skipped = behaviouralTest().replace("test(\"submit\"", "test.skip(\"submit\"");
    expect(assessTestStructure(skipped, CRITERION).reasons.join(" ")).toMatch(/Skipped or todo/);
  });

  it("rejects a test that declares no test", () => {
    expect(assessTestStructure(behaviouralTest().replace("test(\"submit\"", "const submit = "), CRITERION).reasons.join(" ")).toMatch(/declares no node:test test/);
  });

  it("rejects a TypeScript product import, which node:test cannot load", () => {
    const body = behaviouralTest().replace("../../src/claims/submit.mjs", "../../src/claims/submit.ts");
    expect(assessTestStructure(body, CRITERION).reasons.join(" ")).toMatch(/TypeScript or JSX/);
  });

  it("rejects a JSX product import", () => {
    const body = behaviouralTest().replace("../../src/claims/submit.mjs", "../../src/components/Form.jsx");
    expect(assessTestStructure(body, CRITERION).reasons.join(" ")).toMatch(/TypeScript or JSX/);
  });

  it("rejects an import without a JavaScript extension", () => {
    const body = behaviouralTest().replace("../../src/claims/submit.mjs", "../../src/claims/submit");
    expect(assessTestStructure(body, CRITERION).reasons.join(" ")).toMatch(/without a JavaScript extension/);
  });

  it("rejects a bare package or alias import, which this phase cannot satisfy", () => {
    const body = behaviouralTest().replace("../../src/claims/submit.mjs", "@/claims/submit");
    expect(assessTestStructure(body, CRITERION).reasons.join(" ")).toMatch(/Only node: built-ins and relative/);
  });

  it("allows node: built-ins without treating them as product code", () => {
    const result = assessTestStructure(behaviouralTest(), CRITERION);
    expect(result.productImports).not.toContain("node:test");
  });

  it("rejects a test that does not import any product module", () => {
    const body = behaviouralTest().replace("import { submitClaim } from \"../../src/claims/submit.mjs\";", "");
    expect(assessTestStructure(body, CRITERION).reasons.join(" ")).toMatch(/does not import any product module/);
  });
});

describe("isLiteralExpression", () => {
  it("recognises literal values and literal-only comparisons", () => {
    expect(isLiteralExpression("true")).toBe(true);
    expect(isLiteralExpression("\"text\"")).toBe(true);
    expect(isLiteralExpression("1 === 1")).toBe(true);
    expect(isLiteralExpression("[]")).toBe(true);
  });

  it("does not treat a reference to a value as a literal", () => {
    expect(isLiteralExpression("submitClaim()")).toBe(false);
    expect(isLiteralExpression("result")).toBe(false);
    expect(isLiteralExpression("\"a\" + value")).toBe(false);
  });
});

describe("readArguments and assertionArguments", () => {
  it("reads nested arguments at the top level only", () => {
    const { args } = readArguments("assert.equal(f(a, b), \"x\")", "assert.equal".length);
    expect(args).toEqual(["f(a, b)", "\"x\""]);
  });

  it("keeps matcher arguments with an expect assertion", () => {
    const [args] = assertionArguments("expect(submit()).toBe(true);");
    expect(args).toEqual(["submit()", "true"]);
  });
});

describe("resolveProductImport", () => {
  it("resolves a relative import against the test file location", () => {
    expect(resolveProductImport(FILE, "../../src/claims/submit.mjs")).toBe("src/claims/submit.mjs");
  });

  it("returns null when the import leaves the workspace", () => {
    expect(resolveProductImport(FILE, "../../../outside.mjs")).toBeNull();
  });
});

describe("assessTestBinding", () => {
  it("passes when the imported product module exists in the approved snapshot", () => {
    const workspacePath = workspaceWith({ "src/claims/submit.mjs": "export const x = 1;\n" });
    const result = assessTestBinding({ body: behaviouralTest(), criterionId: CRITERION, filePath: FILE, workspacePath });
    expect(result.ok).toBe(true);
  });

  it("refuses an import of a product module that is not in the snapshot", () => {
    const workspacePath = workspaceWith({ "src/other.mjs": "export const x = 1;\n" });
    const result = assessTestBinding({ body: behaviouralTest(), criterionId: CRITERION, filePath: FILE, workspacePath });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/does not exist in the approved snapshot/);
  });

  it("refuses a test file outside verification/", () => {
    const workspacePath = workspaceWith({ "src/claims/submit.mjs": "export const x = 1;\n" });
    const result = assessTestBinding({
      body: behaviouralTest(),
      criterionId: CRITERION,
      filePath: "src/claims/submit.test.mjs",
      workspacePath,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/refused by verification policy/);
  });

  it("refuses an import that resolves through a symbolic link out of the workspace", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "apf-binding-outside-"));
    temporary.push(outside);
    fs.writeFileSync(path.join(outside, "secret.mjs"), "export const secret = 1;\n");
    const workspacePath = workspaceWith({});
    fs.mkdirSync(path.join(workspacePath, "src/claims"), { recursive: true });
    fs.symlinkSync(path.join(outside, "secret.mjs"), path.join(workspacePath, "src/claims/submit.mjs"));
    const result = assessTestBinding({ body: behaviouralTest(), criterionId: CRITERION, filePath: FILE, workspacePath });
    expect(result.ok).toBe(false);
  });
});

const HTTP_FILE = "verification/http/discovery.test.mjs";
const HTTP_HINT = { filePath: HTTP_FILE, adapterId: "http-blackbox", targetSurface: "HTTP_ENDPOINT" };

function httpBody(overrides: { marker?: boolean; fetch?: boolean; assert?: string; external?: boolean } = {}) {
  const marker = overrides.marker === false ? "" : MARKER;
  const request = overrides.external
    ? 'const response = await fetch("https://example.com/api/discovery/feed");'
    : overrides.fetch === false
      ? "const response = { status: 200 };"
      : "const response = await fetch(`${process.env.VERIFICATION_BASE_URL}/api/discovery/feed`);";
  const assertion = overrides.assert ?? "assert.equal(response.status, 200);";
  return [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    marker,
    'test("discovery feed", async () => {',
    "  const base = process.env.VERIFICATION_BASE_URL;",
    request,
    `  ${assertion}`,
    "});",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

describe("adapter-aware binding: module vs HTTP", () => {
  it("1. accepts a valid module-based test with meaningful imports", () => {
    expect(assessTestStructure(behaviouralTest(), CRITERION).ok).toBe(true);
  });

  it("2. rejects a module-based test without required imports", () => {
    const body = behaviouralTest().replace('import { submitClaim } from "../../src/claims/submit.mjs";', "");
    expect(assessTestStructure(body, CRITERION).reasons.join(" ")).toMatch(/does not import any product module/);
  });

  it("3. accepts a valid HTTP black-box test without product imports when HTTP intent is declared", () => {
    const body = httpBody();
    expect(isHttpBlackboxTest(body)).toBe(true);
    const result = assessTestStructure(body, CRITERION, HTTP_HINT);
    expect(result.ok).toBe(true);
    expect(result.productImports).toEqual([]);
    expect(assessTestBinding({ body, criterionId: CRITERION, workspacePath: workspaceWith({}), ...HTTP_HINT }).ok).toBe(true);
  });

  it("does not apply the module-import rule to an HTTP proposal that still lacks fetch", () => {
    // This matches the Task 4 failure: the proposal named http-blackbox and verification/http/, but the body had not
    // yet called fetch. The refusal must say the HTTP request is missing, not that a product module is missing.
    const body = httpBody({ fetch: false });
    const result = assessTestStructure(body, CRITERION, HTTP_HINT);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/must call fetch/);
    expect(result.reasons.join(" ")).not.toMatch(/does not import any product module/);
  });

  it("4. rejects an HTTP test with an invalid criterion marker", () => {
    const body = httpBody({ marker: false });
    expect(assessTestStructure(body, CRITERION, HTTP_HINT).reasons.join(" ")).toMatch(/does not carry the marker/);
  });

  it("5. rejects an HTTP test targeting an unsupported external destination", () => {
    const body = httpBody({ external: true });
    expect(fetchTargetsExternalOrigin(body)).toBe(true);
    expect(assessTestStructure(body, CRITERION, HTTP_HINT).reasons.join(" ")).toMatch(/literal external URL/);
  });

  it("6. rejects an HTTP test without meaningful assertions", () => {
    const body = httpBody({ assert: "assert.ok(true);" });
    expect(assessTestStructure(body, CRITERION, HTTP_HINT).ok).toBe(false);
    expect(assessTestStructure(body, CRITERION, HTTP_HINT).reasons.join(" ")).toMatch(/trivial assertion|no assertion on an HTTP response/);
  });

  it("recognises HTTP execution intent from adapter, surface or file path", () => {
    expect(isHttpExecutionIntent({ adapterId: "http-blackbox" })).toBe(true);
    expect(isHttpExecutionIntent({ targetSurface: "HTTP_ENDPOINT" })).toBe(true);
    expect(isHttpExecutionIntent({ filePath: HTTP_FILE })).toBe(true);
    expect(isHttpExecutionIntent({ adapterId: "node-test-mjs", filePath: FILE })).toBe(false);
  });
});
